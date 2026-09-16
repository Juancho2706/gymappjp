/**
 * Dossier del alumno — modelo de datos PURO y serializable para el export a PDF.
 *
 * `buildClientDossier` mapea el retorno de `getClientProfileData` (service) a una
 * estructura plana, sin `Date` (solo ISO strings) y sin tipos de Supabase/Next, de
 * modo que el generador de PDF (cliente) y los tests puedan consumirla sin arrastrar
 * la capa server. Es una función PURA: no toca red, cookies ni reloj (la fecha de
 * generación entra por `opts.generatedAtIso`).
 *
 * @privacidad El dossier se comparte con el alumno ⇒ NO incluye pagos/billing.
 */

import { workoutPlanMatchesVariant } from '@/lib/workout/programWeekVariant'

import type {
    ClientDossierData,
    DossierCheckIn,
    DossierMuscleVolume,
    DossierPersonalRecord,
    DossierProgramDay,
    DossierStatusLevel,
} from '@eva/client-dossier'

// ─── Tipos de salida (serializables) ─────────────────────────────────────────
// Viven en `@eva/client-dossier` (R13) porque el informe MENSUAL los arma desde RN también.
// Se re-exportan tal cual para no tocar a los consumidores de este módulo (server action,
// generador jsPDF, smoke test y test unitario siguen importando desde acá).

export type {
    ClientDossierData,
    DossierCheckIn,
    DossierMuscleVolume,
    DossierPeriod,
    DossierPersonalRecord,
    DossierProgramDay,
    DossierStatusLevel,
    DossierTile,
    DossierTone,
} from '@eva/client-dossier'

// ─── Tipo de entrada (estructural, desacoplado de Supabase/Next) ──────────────
// Describe SOLO los campos que se leen del retorno de `getClientProfileData`.
// El objeto real trae más campos (excess props permitidos al pasar variables).

type ProfileClient = {
    full_name: string
    email: string
    phone: string | null
    subscription_start_date: string | null
    created_at: string
    is_active: boolean | null
}

type ProfileWorkoutPlan = {
    title?: string | null
    day_of_week?: number | null
    /** Variante A/B del microciclo (null/ausente = 'A' legacy). */
    week_variant?: string | null
    workout_blocks?: unknown[] | null
}

type ProfileProgram = {
    name?: string | null
    weeks_to_repeat?: number | null
    workout_plans?: ProfileWorkoutPlan[] | null
}

type ProfileCompliance = {
    workoutsThisWeek?: number
    workoutsTarget?: number
    currentStreak?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    planDaysRemaining?: number
    checkInCompliancePercent?: number
}

/**
 * Señal de nutrición V2 (`NutritionV2Signal` de `nutritionTabV2.logic.ts`), resuelta por el server
 * action del dossier en la MISMA lectura que alimenta el tab. Estructural a propósito, como el
 * resto de las entradas de este módulo: mantiene el builder puro y sin imports de la capa app.
 */
type ProfileNutritionV2 = {
    hasActivePlan?: boolean
    planName?: string | null
    today?: { calories?: { consumed?: number | null; target?: number | null } | null } | null
    todayPct?: number | null
    todayMacroTargets?: {
        calories?: number | null
        proteinG?: number | null
        carbsG?: number | null
        fatsG?: number | null
    } | null
    todaySlotCount?: number | null
    weeklyInRangePct?: number | null
    weeklyInRangeDays?: number | null
    weeklyTrackedDays?: number | null
    dayTargets?: { label?: string | null; calories?: number | null }[] | null
}

type ProfileCheckIn = {
    created_at?: string | null
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    front_photo_url?: string | null
}

type ProfilePersonalRecord = {
    exerciseName?: string | null
    muscleGroup?: string | null
    maxWeightKg?: number | null
    repsAtMax?: number | null
}

type ProfileMuscleVolume = {
    muscleGroup?: string | null
    volume?: number | null
}

export type ClientDossierInput = {
    client: ProfileClient
    activeProgram?: ProfileProgram | null
    checkIns?: ProfileCheckIn[] | null
    compliance?: ProfileCompliance | null
    personalRecords?: ProfilePersonalRecord[] | null
    muscleVolumeByGroup?: ProfileMuscleVolume[] | null
    /**
     * Señal de nutrición V2 de la misma carga (server action `getClientDossier`). Ausente/`null`
     * ⇒ el dossier omite la sección de nutrición. Reemplaza a `activeNutritionPlanWithMeals` +
     * `nutritionMonthlyAvgPct`, que eran V1.
     */
    nutritionV2?: ProfileNutritionV2 | null
    attentionScore?: number | null
    profileLastActivityAt?: string | null
    /**
     * Variante A/B EFECTIVA del programa activo, ya resuelta por el service (la misma
     * que usa para el target semanal). null = sin programa ⇒ no se filtra por variante.
     */
    programEffectiveWeekVariant?: string | null
    programAbMode?: boolean | null
}

export type BuildClientDossierOpts = {
    generatedAtIso: string
}

// Cantidades máximas por sección (mantener el PDF acotado).
const MAX_PERSONAL_RECORDS = 10
const MAX_MUSCLE_GROUPS = 8
const MAX_PROGRAM_DAYS = 14
const MAX_CHECKINS = 30
const NOTES_MAX_LEN = 200

/**
 * Umbrales del War Room / badge del hero (ClientProfileHero, CoachWarRoom,
 * ClientsDirectory): score ≥ 50 = urgente, ≥ 25 = atención, resto = al día.
 * Se mantiene 25 (no 30) para NO contradecir el badge que el coach ve en pantalla.
 */
export function deriveStatusLevel(score: number): DossierStatusLevel {
    if (score >= 50) return 'urgente'
    if (score >= 25) return 'atencion'
    return 'aldia'
}

function toNum(v: unknown): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

function truncateNotes(raw: string | null | undefined): string | null {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null
    return s.length > NOTES_MAX_LEN ? `${s.slice(0, NOTES_MAX_LEN - 1)}…` : s
}

/** Mapea el retorno de `getClientProfileData` al dossier serializable. Función PURA. */
export function buildClientDossier(
    input: ClientDossierInput,
    opts: BuildClientDossierOpts
): ClientDossierData {
    const client = input.client
    const compliance = input.compliance ?? {}
    const attentionScore = Math.round(toNum(input.attentionScore))

    // ── Check-ins: vienen ordenados DESC (más reciente primero). Δ vs el anterior
    //    cronológico (= el siguiente en la lista DESC). Copia defensiva + reordena
    //    por si el caller cambia el orden.
    const checkInsRaw = [...(input.checkIns ?? [])]
        .filter((c) => !!c && !!c.created_at)
        .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())

    const checkIns: DossierCheckIn[] = checkInsRaw.map((c, idx) => {
        const prev = checkInsRaw[idx + 1]
        const w = c.weight ?? null
        const pw = prev?.weight ?? null
        const delta =
            w != null && pw != null ? Number((w - pw).toFixed(2)) : null
        return {
            dateIso: c.created_at as string,
            weightKg: w,
            weightDeltaKg: delta,
            energyLevel: c.energy_level ?? null,
            notes: truncateNotes(c.notes),
            photoUrl: c.front_photo_url ?? null,
        }
    })

    // ── Peso actual + Δ (último vs penúltimo check-in).
    const currentWeightKg = checkIns[0]?.weightKg ?? null
    const weightDeltaKg = checkIns[0]?.weightDeltaKg ?? null

    // ── Programa activo (empty-state si no hay).
    let program: ClientDossierData['program'] = null
    const ap = input.activeProgram
    if (ap) {
        // Variante A/B: sin filtrar, un programa A/B listaría los días de AMBAS semanas
        // (6 en vez de 3). Se usa la variante EFECTIVA que el service ya resolvió para el
        // target semanal; sin dato (callers legacy) no se filtra.
        const variant = input.programEffectiveWeekVariant
        const plans = (ap.workout_plans ?? []).filter(
            (p): p is ProfileWorkoutPlan =>
                !!p &&
                Array.isArray(p.workout_blocks) &&
                (p.workout_blocks?.length ?? 0) > 0 &&
                (variant == null ||
                    workoutPlanMatchesVariant(p, variant === 'B' ? 'B' : 'A', !!input.programAbMode))
        )
        const days: DossierProgramDay[] = plans
            .slice(0, MAX_PROGRAM_DAYS)
            .map((p) => ({
                title: (p.title ?? '').trim() || 'Día de entrenamiento',
                dayOfWeek: p.day_of_week ?? null,
                blockCount: p.workout_blocks?.length ?? 0,
            }))
        program = {
            name: (ap.name ?? '').trim() || 'Programa activo',
            currentWeek: Math.max(0, toNum(compliance.planCurrentWeek)),
            totalWeeks: Math.max(1, toNum(ap.weeks_to_repeat) || toNum(compliance.planTotalWeeks) || 1),
            daysRemaining: Math.max(0, toNum(compliance.planDaysRemaining)),
            days,
        }
    }

    // ── Entrenamiento: PRs (top ~10) + volumen por grupo.
    const personalRecords: DossierPersonalRecord[] = (input.personalRecords ?? [])
        .slice(0, MAX_PERSONAL_RECORDS)
        .map((r) => ({
            exerciseName: (r.exerciseName ?? '').trim() || 'Ejercicio',
            muscleGroup: (r.muscleGroup ?? '').trim() || '—',
            maxWeightKg: toNum(r.maxWeightKg),
            repsAtMax: toNum(r.repsAtMax),
        }))
    const muscleVolume: DossierMuscleVolume[] = (input.muscleVolumeByGroup ?? [])
        .filter((v) => toNum(v.volume) > 0)
        .slice(0, MAX_MUSCLE_GROUPS)
        .map((v) => ({
            muscleGroup: (v.muscleGroup ?? '').trim() || 'Otro',
            volume: Math.round(toNum(v.volume)),
        }))

    // ── Nutrición: plan V2 VIGENTE (empty-state si no hay). Sin plan vigente el PDF no imprime
    //    plan alguno: exportar el V1 mandaba al alumno un plan viejo/convertido (auditoría §2.2).
    const nv2 = input.nutritionV2
    let nutrition: ClientDossierData['nutrition'] = null
    if (nv2?.hasActivePlan === true) {
        const dayTargets = (nv2.dayTargets ?? [])
            .filter((v): v is { label?: string | null; calories?: number | null } => !!v)
            .map((v) => ({
                label: (v.label ?? '').trim() || 'Plan del día',
                calories: v.calories ?? null,
            }))
        nutrition = {
            planName: (nv2.planName ?? '').trim() || 'Plan de nutrición',
            goals: {
                calories: nv2.todayMacroTargets?.calories ?? null,
                protein: nv2.todayMacroTargets?.proteinG ?? null,
                carbs: nv2.todayMacroTargets?.carbsG ?? null,
                fats: nv2.todayMacroTargets?.fatsG ?? null,
            },
            mealsTotal: Math.max(0, toNum(nv2.todaySlotCount)),
            // Multi-día = más de una variante: las metas cambian según el día.
            hasDaySpecificMeals: dayTargets.length > 1,
            dayTargets,
            weeklyInRangePct: nv2.weeklyInRangePct ?? null,
            weeklyInRangeDays: Math.max(0, toNum(nv2.weeklyInRangeDays)),
            weeklyTrackedDays: Math.max(0, toNum(nv2.weeklyTrackedDays)),
        }
    }

    // ── Métricas.
    const workoutsDone = Math.max(0, toNum(compliance.workoutsThisWeek))
    const workoutsTarget = Math.max(1, toNum(compliance.workoutsTarget) || 1)
    const adherenceWeeklyPct = Math.min(100, Math.round((workoutsDone / workoutsTarget) * 100))

    return {
        generatedAtIso: opts.generatedAtIso,
        identity: {
            fullName: (client.full_name ?? '').trim() || 'Alumno',
            email: client.email ?? '',
            phone: client.phone ?? null,
            isActive: client.is_active !== false,
            clientSinceIso: client.subscription_start_date || client.created_at || null,
            streakDays: Math.max(0, toNum(compliance.currentStreak)),
            lastActivityIso: input.profileLastActivityAt ?? null,
        },
        status: {
            attentionScore,
            level: deriveStatusLevel(attentionScore),
        },
        metrics: {
            currentWeightKg,
            weightDeltaKg,
            workoutsDone,
            workoutsTarget,
            adherenceWeeklyPct,
            nutritionTodayKcal:
                nv2?.hasActivePlan === true
                    ? {
                          consumed: Math.max(0, toNum(nv2.today?.calories?.consumed)),
                          target: nv2.today?.calories?.target ?? null,
                      }
                    : null,
            // Sin tope en 100: comer 130 % de la meta se lee 130 %, igual que la ficha V2.
            nutritionTodayPct:
                nv2?.hasActivePlan === true && nv2.todayPct != null
                    ? Math.max(0, Math.round(nv2.todayPct))
                    : null,
            nutritionWeeklyInRangePct:
                nv2?.hasActivePlan === true && nv2.weeklyInRangePct != null
                    ? Math.min(100, Math.max(0, Math.round(nv2.weeklyInRangePct)))
                    : null,
            checkInCompliancePct: Math.min(100, Math.max(0, Math.round(toNum(compliance.checkInCompliancePercent)))),
            planCurrentWeek: Math.max(0, toNum(compliance.planCurrentWeek)),
            planTotalWeeks: Math.max(1, toNum(compliance.planTotalWeeks) || 1),
        },
        program,
        training: { personalRecords, muscleVolume },
        nutrition,
        // Cap consistente con el resto de las secciones; los más recientes (lista DESC).
        // currentWeightKg/weightDeltaKg salen de checkIns[0] ⇒ el slice no los afecta.
        checkIns: checkIns.slice(0, MAX_CHECKINS),
        checkInsTotal: checkIns.length,
    }
}
