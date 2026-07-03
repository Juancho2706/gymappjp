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

// ─── Tipos de salida (serializables) ─────────────────────────────────────────

/** Nivel de atención derivado del attentionScore (mismos umbrales que el War Room). */
export type DossierStatusLevel = 'urgente' | 'atencion' | 'aldia'

export type DossierCheckIn = {
    /** ISO del check-in (created_at). */
    dateIso: string
    weightKg: number | null
    /** Δ peso vs el check-in cronológicamente anterior (null si no hay con qué comparar). */
    weightDeltaKg: number | null
    energyLevel: number | null
    /** Notas truncadas (~200 chars) — null si no hay. */
    notes: string | null
    /** URL firmada de la foto frontal (ya resuelta server-side, TTL corto) — puede ser null. */
    photoUrl: string | null
}

export type DossierPersonalRecord = {
    exerciseName: string
    muscleGroup: string
    maxWeightKg: number
    repsAtMax: number
}

export type DossierMuscleVolume = {
    muscleGroup: string
    volume: number
}

export type DossierProgramDay = {
    title: string
    dayOfWeek: number | null
    blockCount: number
}

export type ClientDossierData = {
    /** ISO de generación (pasado por el caller, no calculado acá). */
    generatedAtIso: string
    identity: {
        fullName: string
        email: string
        phone: string | null
        isActive: boolean
        /** ISO de "cliente desde" (subscription_start_date ?? created_at). */
        clientSinceIso: string | null
        streakDays: number
        lastActivityIso: string | null
    }
    status: {
        attentionScore: number
        level: DossierStatusLevel
    }
    metrics: {
        currentWeightKg: number | null
        /** Δ peso último check-in vs anterior. */
        weightDeltaKg: number | null
        workoutsDone: number
        workoutsTarget: number
        adherenceWeeklyPct: number
        mealsDoneToday: number
        mealsTotalToday: number
        nutritionTodayPct: number
        nutritionAdherence30dPct: number | null
        checkInCompliancePct: number
        planCurrentWeek: number
        planTotalWeeks: number
    }
    program: {
        name: string
        currentWeek: number
        totalWeeks: number
        daysRemaining: number
        days: DossierProgramDay[]
    } | null
    training: {
        personalRecords: DossierPersonalRecord[]
        muscleVolume: DossierMuscleVolume[]
    }
    nutrition: {
        planName: string
        goals: {
            calories: number | null
            protein: number | null
            carbs: number | null
            fats: number | null
        }
        /** Total de comidas del plan (si hay day-specific NO equivale a "por día"). */
        mealsTotal: number
        /** true si ALGUNA comida es específica de un día (day_of_week != null). */
        hasDaySpecificMeals: boolean
    } | null
    /** Últimos MAX_CHECKINS check-ins (DESC). El total real vive en checkInsTotal. */
    checkIns: DossierCheckIn[]
    /** Total de check-ins del alumno (para la nota "mostrando N de M" del PDF). */
    checkInsTotal: number
}

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
    nutritionCompliancePercent?: number
    todayMealsDone?: number
    todayMealsTotal?: number
    currentStreak?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    planDaysRemaining?: number
    checkInCompliancePercent?: number
}

type ProfileCheckIn = {
    created_at?: string | null
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    front_photo_url?: string | null
}

type ProfileNutritionMeal = {
    /** null/undefined = comida de TODOS los días; número = day-specific. */
    day_of_week?: number | null
}

type ProfileNutritionPlan = {
    name?: string | null
    daily_calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
    nutrition_meals?: ProfileNutritionMeal[] | null
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
    activeNutritionPlanWithMeals?: ProfileNutritionPlan | null
    checkIns?: ProfileCheckIn[] | null
    compliance?: ProfileCompliance | null
    personalRecords?: ProfilePersonalRecord[] | null
    muscleVolumeByGroup?: ProfileMuscleVolume[] | null
    nutritionMonthlyAvgPct?: number | null
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

    // ── Nutrición: plan activo (empty-state si no hay).
    let nutrition: ClientDossierData['nutrition'] = null
    const np = input.activeNutritionPlanWithMeals
    if (np) {
        // nutrition_meals puede mezclar comidas de todos los días (day_of_week null) con
        // comidas day-specific (day_of_week != null). Si hay day-specific, el total del
        // plan NO es "por día" (7 días × 4 comidas diría "28 por día") → el generador
        // etiqueta distinto según hasDaySpecificMeals.
        const meals = Array.isArray(np.nutrition_meals) ? np.nutrition_meals : []
        nutrition = {
            planName: (np.name ?? '').trim() || 'Plan nutricional',
            goals: {
                calories: np.daily_calories ?? null,
                protein: np.protein_g ?? null,
                carbs: np.carbs_g ?? null,
                fats: np.fats_g ?? null,
            },
            mealsTotal: meals.length,
            hasDaySpecificMeals: meals.some((m) => m?.day_of_week != null),
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
            mealsDoneToday: Math.max(0, toNum(compliance.todayMealsDone)),
            mealsTotalToday: Math.max(1, toNum(compliance.todayMealsTotal) || 1),
            nutritionTodayPct: Math.min(100, Math.max(0, Math.round(toNum(compliance.nutritionCompliancePercent)))),
            nutritionAdherence30dPct:
                input.nutritionMonthlyAvgPct == null ? null : Math.round(toNum(input.nutritionMonthlyAvgPct)),
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
