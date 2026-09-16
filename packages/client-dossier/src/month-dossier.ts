/**
 * `buildClientMonthDossier` — arma el `ClientDossierData` de UN mes desde el jsonb del RPC
 * `public.get_client_month_reports` (contrato R10).
 *
 * Función PURA: sin red, sin `Date.now()`, sin zona horaria implícita. El corte del mes ya viene
 * resuelto en Santiago por el RPC (R1); acá solo se comparan cadenas `YYYY-MM-DD`.
 *
 * Reglas: R14 (tiles precomputados) y R15 (peso/Δ, récords nuevos, programa, nutrición del mes).
 */

import { formatDayMonth, formatMonthLabel, toMonthKey } from './months'
import type {
    BuildClientMonthDossierOpts,
    ClientDossierData,
    DossierCheckIn,
    DossierMuscleVolume,
    DossierPersonalRecord,
    DossierProgramDay,
    DossierTile,
    DossierTone,
    JsonNumber,
    MonthReportJson,
} from './types'

// Topes por sección (mismos que el dossier de hoy: el PDF no puede crecer sin límite).
const MAX_PERSONAL_RECORDS = 10
const MAX_MUSCLE_GROUPS = 8
const MAX_PROGRAM_DAYS = 14
const MAX_CHECKINS = 30
const NOTES_MAX_LEN = 200

// Dead-band del Δ de peso: ±0.05 kg se lee «sin cambio» (idéntico al dossier de hoy).
const WEIGHT_DEADBAND_KG = 0.05

const PROGRAM_FROM_LOGS_NAME = 'Entrenamientos registrados'

// ─── Normalización de jsonb ──────────────────────────────────────────────────

/** numeric de Postgres puede llegar como string ⇒ SIEMPRE por `Number`. */
function numOrNull(v: JsonNumber | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

function num(v: JsonNumber | null | undefined, fallback = 0): number {
    return numOrNull(v) ?? fallback
}

function str(v: string | null | undefined): string {
    return String(v ?? '').trim()
}

function truncateNotes(raw: string | null | undefined): string | null {
    const s = str(raw)
    if (!s) return null
    return s.length > NOTES_MAX_LEN ? `${s.slice(0, NOTES_MAX_LEN - 1)}…` : s
}

function plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many
}

/** Miles con punto, estilo es-CL, SIN `toLocaleString` (determinista en cualquier runtime/ICU). */
function formatThousands(n: number): string {
    const rounded = Math.round(n)
    const sign = rounded < 0 ? '-' : ''
    return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** `64.4` ⇒ `64,4` (decimal con coma, como el resto del informe mensual, R15). */
function formatKg(n: number): string {
    return String(n).replace('.', ',')
}

/** `YYYY-MM-DD` del comienzo de una fecha/timestamp ISO. Cadena vacía si no hay. */
function dayOf(iso: string | null | undefined): string {
    const s = str(iso)
    return s.length >= 10 ? s.slice(0, 10) : ''
}

function isWithinPeriod(iso: string | null | undefined, fromIso: string, toIso: string): boolean {
    const d = dayOf(iso)
    if (!d) return false
    return d >= dayOf(fromIso) && d <= dayOf(toIso)
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/** Mapea UN mes del jsonb del RPC al dossier serializable. Función PURA. */
export function buildClientMonthDossier(
    report: MonthReportJson,
    opts: BuildClientMonthDossierOpts
): ClientDossierData {
    const monthKey = toMonthKey(report.month) || toMonthKey(report.period?.from)
    const label = formatMonthLabel(monthKey)
    const fromIso = str(report.period?.from)
    const toIso = str(report.period?.to)

    // ── Entrenamiento del período.
    const trainingDays = (report.training_days ?? []).filter((d): d is string => !!d).slice().sort()
    const trainedDays = trainingDays.length
    const sessions = Math.max(0, num(report.sessions, trainedDays))
    // El RPC puede devolver 0 (programa cuyos planes no tienen `day_of_week`), no solo null: los
    // dos casos significan «sin denominador» y se tratan igual — jamás una división por cero ni un
    // «12/0» impreso.
    const plannedDaysRaw = numOrNull(report.planned_days)
    const plannedDays = plannedDaysRaw != null && plannedDaysRaw > 0 ? plannedDaysRaw : null
    // R7: sin programa ⇒ sin denominador ⇒ adherencia `null` (el PDF imprime «—», no 0 %).
    const adherencePct =
        plannedDays != null && plannedDays > 0
            ? Math.min(100, Math.max(0, Math.round((trainedDays / plannedDays) * 100)))
            : null

    // ── Volumen por grupo (top 8) + total.
    const muscleVolume: DossierMuscleVolume[] = (report.volume_by_group ?? [])
        .map((v) => ({ muscleGroup: str(v?.muscle_group) || 'Otro', volume: Math.round(num(v?.volume)) }))
        .filter((v) => v.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, MAX_MUSCLE_GROUPS)
    const volumeTotal = Math.round(
        numOrNull(report.volume_total) ??
            (report.volume_by_group ?? []).reduce((acc, v) => acc + num(v?.volume), 0)
    )

    // ── Récords del mes (top 10 por peso). `isNew` = supera el máximo histórico previo (R15).
    const prsAll = (report.prs ?? []).filter((p): p is NonNullable<typeof p> => !!p)
    const prsSorted = prsAll.slice().sort((a, b) => num(b.max_weight_kg) - num(a.max_weight_kg))
    const isNewPr = (p: (typeof prsAll)[number]): boolean => {
        const prev = numOrNull(p.prev_max_kg)
        return prev == null || num(p.max_weight_kg) > prev
    }
    const personalRecords: DossierPersonalRecord[] = prsSorted.slice(0, MAX_PERSONAL_RECORDS).map((p) => ({
        exerciseName: str(p.name) || 'Ejercicio',
        muscleGroup: str(p.muscle_group) || '—',
        maxWeightKg: num(p.max_weight_kg),
        repsAtMax: num(p.reps_at_max),
        isNew: isNewPr(p),
    }))
    // El tile cuenta TODOS los récords nuevos del mes, no solo los 10 que entran a la tabla.
    const newPrCount = prsAll.filter(isNewPr).length

    // ── Programa vigente en el mes (R7/R15) o fallback por nombres de plan de los logs.
    let program: ClientDossierData['program'] = null
    const rp = report.program
    if (rp) {
        const weeksTotal = Math.max(1, num(rp.weeks_total, 1))
        const weekFrom = numOrNull(rp.week_from)
        const weekTo = numOrNull(rp.week_to)
        const parts: string[] = []
        if (weekFrom != null && weekTo != null) {
            parts.push(
                weekFrom === weekTo
                    ? `Semana ${weekFrom} de ${weeksTotal}`
                    : `Semanas ${weekFrom}–${weekTo} de ${weeksTotal}`
            )
        }
        const endDay = dayOf(rp.end_date)
        if (endDay && toIso && endDay < dayOf(toIso)) parts.push(`finalizó el ${formatDayMonth(endDay)}`)
        // A/B: el programa trae las DOS variantes ⇒ `day_of_week` se repite. Se listan tal cual
        // (el informe es del mes entero, no de una semana): NO se deduplica.
        const days: DossierProgramDay[] = (rp.days ?? [])
            .filter((d): d is NonNullable<typeof d> => !!d)
            .slice(0, MAX_PROGRAM_DAYS)
            .map((d) => ({
                title: str(d.title) || 'Día de entrenamiento',
                dayOfWeek: numOrNull(d.day_of_week),
                blockCount: Math.max(0, num(d.block_count)),
            }))
        program = {
            name: str(rp.name) || 'Programa del mes',
            currentWeek: Math.max(0, weekTo ?? 0),
            totalWeeks: weeksTotal,
            daysRemaining: 0,
            days,
            subtitle: parts.length ? parts.join('   ·   ') : null,
        }
    } else {
        // Sin `workout_programs` vigente (borrado duro o start_date null): se listan los nombres de
        // plan vistos en los logs, SIN conteo de ejercicios (blockCount 0 ⇒ el generador no imprime
        // el contador).
        const names = (report.plan_names_from_logs ?? [])
            .map((n) => str(n))
            .filter((n) => !!n)
            .slice(0, MAX_PROGRAM_DAYS)
        if (names.length) {
            program = {
                name: PROGRAM_FROM_LOGS_NAME,
                currentWeek: 0,
                totalWeeks: 1,
                daysRemaining: 0,
                days: names.map((n) => ({ title: n, dayOfWeek: null, blockCount: 0 })),
                subtitle: null,
            }
        }
    }

    // ── Check-ins del mes (DESC). Δ encadenado DENTRO del mes, igual que el dossier de hoy;
    //    el Δ del tile usa `weight.prev_kg`, que sí puede cruzar de mes (R10).
    const checkInsRaw = (report.check_ins ?? [])
        .filter((c): c is NonNullable<typeof c> => !!c && !!c.created_at)
        .slice()
        .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
    const photoUrls = opts.photoUrls ?? {}
    const checkIns: DossierCheckIn[] = checkInsRaw.map((c, idx) => {
        const w = numOrNull(c.weight)
        const pw = numOrNull(checkInsRaw[idx + 1]?.weight)
        const id = str(c.id)
        return {
            dateIso: str(c.created_at),
            weightKg: w,
            weightDeltaKg: w != null && pw != null ? Number((w - pw).toFixed(2)) : null,
            energyLevel: numOrNull(c.energy_level),
            notes: truncateNotes(c.notes),
            photoUrl: (id ? photoUrls[id] : null) ?? null,
        }
    })

    // ── Peso del cierre del mes (R15).
    const lastKg = numOrNull(report.weight?.last_kg)
    const prevKg = numOrNull(report.weight?.prev_kg)
    const lastAt = str(report.weight?.last_at) || null
    // El RPC ya scopeó `check_ins` al período ⇒ el match exacto es la prueba TZ-free de que el
    // último peso cayó DENTRO del mes. El rango de fechas queda como respaldo.
    const lastWeightInPeriod =
        lastAt != null &&
        (checkInsRaw.some((c) => str(c.created_at) === lastAt) || isWithinPeriod(lastAt, fromIso, toIso))
    const weightDeltaKg =
        lastKg != null && prevKg != null ? Number((lastKg - prevKg).toFixed(2)) : null

    // ── Nutrición del mes (R9): solo nombre del plan + días en rango/registrados del PERÍODO.
    //    `weeklyInRangePct` queda en null a propósito: un informe mensual NO imprime «adherencia
    //    semanal» (el generador corta esa línea con el null).
    const rn = report.nutrition
    let nutrition: ClientDossierData['nutrition'] = null
    if (rn) {
        const inRangeDays = Math.max(0, num(rn.in_range_days))
        const trackedDays = Math.max(0, num(rn.tracked_days))
        nutrition = {
            planName: str(rn.plan_name) || 'Plan de nutrición',
            // Los snapshots de nutrición son lazy ⇒ el jsonb no trae metas; van en null y el
            // generador omite los chips de objetivos (R9).
            goals: {
                calories: numOrNull(rn.calories),
                protein: numOrNull(rn.protein_g),
                carbs: numOrNull(rn.carbs_g),
                fats: numOrNull(rn.fats_g),
            },
            mealsTotal: 0,
            hasDaySpecificMeals: false,
            dayTargets: [],
            weeklyInRangePct: null,
            weeklyInRangeDays: 0,
            weeklyTrackedDays: 0,
            periodInRangeDays: inRangeDays,
            periodTrackedDays: trackedDays,
            subtitle:
                trackedDays > 0
                    ? `${inRangeDays} de ${trackedDays} ${plural(trackedDays, 'día registrado', 'días registrados')}`
                    : 'sin días registrados',
        }
    }

    const tiles = buildMonthTiles({
        label,
        lastKg,
        weightDeltaKg,
        lastWeightInPeriod,
        lastAt,
        adherencePct,
        trainedDays,
        plannedDays,
        sessions,
        volumeTotal,
        newPrCount,
        prsTotal: prsAll.length,
        checkInsTotal: checkInsRaw.length,
    })

    return {
        generatedAtIso: opts.generatedAtIso,
        period: {
            fromIso,
            toIso,
            monthKey,
            label,
            index: opts.index,
            total: opts.total,
        },
        tiles,
        identity: {
            fullName: str(opts.identity.fullName) || 'Alumno',
            email: str(opts.identity.email),
            phone: opts.identity.phone ?? null,
            isActive: opts.identity.isActive !== false,
            clientSinceIso: opts.identity.clientSinceIso ?? null,
            // El informe mensual no imprime racha (es una métrica del presente, no del período).
            streakDays: 0,
            lastActivityIso: trainingDays.length ? trainingDays[trainingDays.length - 1] : null,
        },
        // El score de atención es del PRESENTE ⇒ no se imprime en modo mes (R15, chip = el mes).
        status: { attentionScore: 0, level: 'aldia' },
        metrics: {
            currentWeightKg: lastKg,
            weightDeltaKg,
            workoutsDone: trainedDays,
            workoutsTarget: Math.max(0, plannedDays ?? 0),
            adherenceWeeklyPct: adherencePct ?? 0,
            periodAdherencePct: adherencePct,
            nutritionTodayKcal: null,
            nutritionTodayPct: null,
            nutritionWeeklyInRangePct: null,
            checkInCompliancePct: 0,
            planCurrentWeek: program ? program.currentWeek : 0,
            planTotalWeeks: program ? program.totalWeeks : 1,
        },
        program,
        training: { personalRecords, muscleVolume },
        nutrition,
        checkIns: checkIns.slice(0, MAX_CHECKINS),
        checkInsTotal: checkInsRaw.length,
    }
}

// ─── Los 6 cuadros del informe mensual (R14) ─────────────────────────────────

type MonthTilesInput = {
    label: string
    lastKg: number | null
    weightDeltaKg: number | null
    lastWeightInPeriod: boolean
    lastAt: string | null
    adherencePct: number | null
    trainedDays: number
    plannedDays: number | null
    sessions: number
    volumeTotal: number
    newPrCount: number
    prsTotal: number
    checkInsTotal: number
}

function adherenceTone(pct: number | null): DossierTone {
    if (pct == null) return 'muted'
    return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger'
}

function buildMonthTiles(i: MonthTilesInput): DossierTile[] {
    // ── Peso: Δ vs el check-in anterior; si el último peso conocido cae FUERA del período se
    //    anota de cuándo es; sin ningún peso, «—».
    let weightSub = 'sin cambio'
    let weightTone: DossierTone = 'muted'
    if (i.lastKg == null) {
        weightSub = '—'
    } else if (!i.lastWeightInPeriod) {
        weightSub = `último check-in ${formatDayMonth(i.lastAt)}`
    } else if (i.weightDeltaKg != null && Math.abs(i.weightDeltaKg) > WEIGHT_DEADBAND_KG) {
        const abs = Math.abs(i.weightDeltaKg).toFixed(1).replace('.', ',')
        weightSub = i.weightDeltaKg > 0 ? `+${abs} kg` : `-${abs} kg`
        weightTone = i.weightDeltaKg > 0 ? 'warning' : 'success'
    }

    return [
        {
            label: `Peso · ${i.label}`,
            value: i.lastKg != null ? `${formatKg(i.lastKg)} kg` : '—',
            sub: weightSub,
            tone: weightTone,
        },
        {
            label: `Adherencia · ${i.label}`,
            value: i.adherencePct == null ? '—' : `${i.adherencePct}%`,
            sub:
                i.plannedDays != null
                    ? `${i.trainedDays} de ${i.plannedDays} ${plural(i.plannedDays, 'día', 'días')}`
                    : `${i.trainedDays} ${plural(i.trainedDays, 'día', 'días')}`,
            tone: adherenceTone(i.adherencePct),
        },
        {
            label: `Días entrenados · ${i.label}`,
            value: i.plannedDays != null ? `${i.trainedDays}/${i.plannedDays}` : `${i.trainedDays}`,
            sub: `${i.sessions} ${plural(i.sessions, 'sesión', 'sesiones')}`,
            tone: 'mid',
        },
        {
            label: `Volumen · ${i.label}`,
            value: `${formatThousands(i.volumeTotal)} kg`,
            sub: 'kg × reps',
            tone: i.volumeTotal > 0 ? 'accent' : 'muted',
        },
        {
            label: `Récords nuevos · ${i.label}`,
            value: `${i.newPrCount}`,
            sub:
                i.prsTotal > 0
                    ? `de ${i.prsTotal} ${plural(i.prsTotal, 'récord', 'récords')} del mes`
                    : 'sin récords',
            tone: i.newPrCount > 0 ? 'accent' : 'muted',
        },
        {
            label: `Check-ins · ${i.label}`,
            value: `${i.checkInsTotal}`,
            sub: i.checkInsTotal > 0 ? 'en el mes' : 'sin check-ins',
            tone: i.checkInsTotal > 0 ? 'mid' : 'muted',
        },
    ]
}
