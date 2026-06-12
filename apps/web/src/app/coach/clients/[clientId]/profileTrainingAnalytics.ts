import { startOfWeek } from 'date-fns'
import type { MuscleVolumeRow } from './profileDataHelpers'

/** 1RM estimado (Epley), alineado con el dashboard del cliente. */
export function epleyOneRM(weightKg: number, reps: number): number {
    if (weightKg <= 0 || reps <= 0) return 0
    return weightKg * (1 + reps / 30)
}

function isKeyCompoundLift(exerciseName: string): boolean {
    const n = exerciseName.toLowerCase()
    if (n.includes('banca') || n.includes('bench') || n.includes('press')) return true
    if (n.includes('sentadilla') || n.includes('squat')) return true
    if (n.includes('muerto') || n.includes('deadlift') || n.includes('dead lift')) return true
    return false
}

export type OneRMHistoryPoint = {
    dateKey: string
    label: string
    oneRm: number
    weightKg: number
    reps: number
}

export type ExerciseStrengthSeries = {
    exerciseId: string
    exerciseName: string
    muscleGroup: string
    series: OneRMHistoryPoint[]
    totalVolume: number
}

/**
 * Por ejercicio y día natural: mejor 1RM Epley del día (si empate, mayor peso).
 */
export function buildExerciseStrengthSeriesMap(workoutHistory: any[]): Map<string, ExerciseStrengthSeries> {
    type DayBest = { oneRm: number; weightKg: number; reps: number }
    type Acc = {
        exerciseName: string
        muscleGroup: string
        byDay: Map<string, DayBest>
        totalVolume: number
    }
    const byEx = new Map<string, Acc>()

    for (const plan of workoutHistory || []) {
        for (const block of plan.workout_blocks || []) {
            const exId =
                (block.exercise_id as string | undefined) ||
                (block.exercises?.id as string | undefined) ||
                `name:${String(block.exercises?.name ?? '')}`
            const name = (block.exercises?.name as string) || 'Ejercicio'
            const muscle = (block.exercises?.muscle_group as string)?.trim() || '—'

            for (const log of block.workout_logs || []) {
                const w = log.weight_kg as number | null | undefined
                const r = (log.reps_done as number | null | undefined) ?? 0
                if (w == null || w <= 0 || r <= 0 || !log.logged_at) continue
                const day = log.logged_at.slice(0, 10)
                const oneRm = epleyOneRM(w, r)
                if (oneRm <= 0) continue

                let acc = byEx.get(exId)
                if (!acc) {
                    acc = { exerciseName: name, muscleGroup: muscle, byDay: new Map(), totalVolume: 0 }
                    byEx.set(exId, acc)
                }
                acc.totalVolume += w * r

                const prev = acc.byDay.get(day)
                if (
                    !prev ||
                    oneRm > prev.oneRm ||
                    (oneRm === prev.oneRm && w > prev.weightKg)
                ) {
                    acc.byDay.set(day, {
                        oneRm: Math.round(oneRm * 10) / 10,
                        weightKg: w,
                        reps: r,
                    })
                }
            }
        }
    }

    const out = new Map<string, ExerciseStrengthSeries>()
    for (const [exerciseId, acc] of byEx) {
        const keys = [...acc.byDay.keys()].sort()
        const series: OneRMHistoryPoint[] = keys.map((dateKey) => {
            const d = acc.byDay.get(dateKey)!
            const dt = new Date(dateKey + 'T12:00:00')
            return {
                dateKey,
                label: dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                oneRm: d.oneRm,
                weightKg: d.weightKg,
                reps: d.reps,
            }
        })
        if (series.length === 0) continue
        out.set(exerciseId, {
            exerciseId,
            exerciseName: acc.exerciseName,
            muscleGroup: acc.muscleGroup,
            series,
            totalVolume: acc.totalVolume,
        })
    }
    return out
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC mapper — `get_client_strength_series` (filas PLANAS, ORDER BY exercise_id, day ASC).
// Reconstruye el mismo Map<exerciseId, ExerciseStrengthSeries> que el helper JS,
// pero el agregado (1RM Epley por día, total_volume) lo calcula Postgres.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila plana de `get_client_strength_series` (1 fila por (ejercicio, día)). */
export type StrengthSeriesRpcRow = {
    exercise_id: string
    name: string
    muscle_group: string
    /** YYYY-MM-DD en zona Santiago. */
    day: string
    one_rm: number
    weight_kg: number
    reps_done: number
    /** Por-ejercicio: idéntico en todas las filas de ese exercise_id. */
    total_volume: number
}

/** `get_client_strength_series` → `Map<string, ExerciseStrengthSeries>`. */
export function mapStrengthSeriesRpc(
    rows: StrengthSeriesRpcRow[] | null
): Map<string, ExerciseStrengthSeries> {
    const out = new Map<string, ExerciseStrengthSeries>()
    if (!rows?.length) return out

    // Las filas ya vienen ORDER BY exercise_id, day ASC → empujamos en orden.
    for (const r of rows) {
        const exId = r.exercise_id
        let entry = out.get(exId)
        if (!entry) {
            entry = {
                exerciseId: exId,
                exerciseName: r.name ?? 'Ejercicio',
                muscleGroup: r.muscle_group?.trim() || '—',
                series: [],
                // total_volume es por-ejercicio: igual en todas las filas → se toma una vez.
                totalVolume: r.total_volume ?? 0,
            }
            out.set(exId, entry)
        }
        const dt = new Date(r.day + 'T12:00:00')
        entry.series.push({
            dateKey: r.day,
            label: dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            oneRm: Math.round((r.one_rm ?? 0) * 10) / 10,
            weightKg: r.weight_kg,
            reps: r.reps_done,
        })
    }

    // Paridad con el helper viejo: descarta ejercicios sin puntos.
    for (const [exId, entry] of out) {
        if (entry.series.length === 0) out.delete(exId)
    }
    return out
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC mapper — `get_client_weekly_prs` (solo ejercicios que mejoraron esta semana).
// ─────────────────────────────────────────────────────────────────────────────

/** Fila de `get_client_weekly_prs`. */
export type WeeklyPrRpcRow = {
    exercise_id: string
    name: string
    muscle_group: string
    week_weight: number
    week_reps: number
    week_1rm: number
    before_weight: number
    before_reps: number
    before_1rm: number
    pct_change: number
}

/** `get_client_weekly_prs` → `WeeklyWeightPR[]` (orden por 1RM nuevo DESC). */
export function mapWeeklyWeightPRsRpc(rows: WeeklyPrRpcRow[] | null): WeeklyWeightPR[] {
    if (!rows?.length) return []
    return rows
        .map((r) => ({
            exerciseId: r.exercise_id,
            exerciseName: r.name ?? 'Ejercicio',
            muscleGroup: r.muscle_group?.trim() || '—',
            newWeightKg: r.week_weight,
            newReps: r.week_reps,
            newOneRm: Math.round((r.week_1rm ?? 0) * 10) / 10,
            prevWeightKg: r.before_weight,
            prevReps: r.before_reps,
            prevOneRm: Math.round((r.before_1rm ?? 0) * 10) / 10,
            pctChange: r.pct_change,
        }))
        .sort((a, b) => b.newOneRm - a.newOneRm)
}

/** Hasta `maxCards` ejercicios: prioriza banca/sentadilla/peso muerto, luego por volumen. */
export function selectStrengthCardExercises(
    workoutHistory: any[],
    maxCards = 4
): ExerciseStrengthSeries[] {
    const map = buildExerciseStrengthSeriesMap(workoutHistory)
    const list = [...map.values()].filter((s) => s.series.length > 0)
    if (list.length === 0) return []

    list.sort((a, b) => {
        const ka = isKeyCompoundLift(a.exerciseName) ? 1 : 0
        const kb = isKeyCompoundLift(b.exerciseName) ? 1 : 0
        if (ka !== kb) return kb - ka
        if (b.totalVolume !== a.totalVolume) return b.totalVolume - a.totalVolume
        return b.series.length - a.series.length
    })

    const seen = new Set<string>()
    const picked: ExerciseStrengthSeries[] = []
    for (const s of list) {
        if (seen.has(s.exerciseId)) continue
        seen.add(s.exerciseId)
        picked.push(s)
        if (picked.length >= maxCards) break
    }
    return picked
}

export function strengthTrendDeltaKg(series: OneRMHistoryPoint[]): number | null {
    if (series.length < 2) return null
    const first = series[0]!.oneRm
    const last = series[series.length - 1]!.oneRm
    return Math.round((last - first) * 10) / 10
}

export function maxOneRMIndex(series: OneRMHistoryPoint[]): number {
    let best = -1
    let idx = 0
    series.forEach((p, i) => {
        if (p.oneRm > best) {
            best = p.oneRm
            idx = i
        }
    })
    return idx
}

export type WeeklyWeightPR = {
    exerciseId: string
    exerciseName: string
    muscleGroup: string
    newWeightKg: number
    newReps: number
    newOneRm: number
    prevWeightKg: number
    prevReps: number
    prevOneRm: number
    pctChange: number | null
}

/** PR de 1RM Epley en la semana calendario (lunes → hoy).
 *  Solo considera sets con reps ≤ 30 (fuerza, no resistencia). */
export function findWeeklyWeightPRs(workoutHistory: any[], now: Date = new Date()): WeeklyWeightPR[] {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })

    type Agg = {
        name: string
        muscle: string
        before1rm: number
        beforeWeightKg: number
        beforeReps: number
        inWeek1rm: number
        inWeekWeightKg: number
        inWeekReps: number
    }
    const byEx = new Map<string, Agg>()

    for (const plan of workoutHistory || []) {
        for (const block of plan.workout_blocks || []) {
            const exId =
                (block.exercise_id as string | undefined) ||
                (block.exercises?.id as string | undefined) ||
                `name:${String(block.exercises?.name ?? '')}`
            const name = (block.exercises?.name as string) || 'Ejercicio'
            const muscle = (block.exercises?.muscle_group as string)?.trim() || '—'

            for (const log of block.workout_logs || []) {
                const w = log.weight_kg as number | null | undefined
                if (w == null || w <= 0) continue
                const r = (log.reps_done as number | null | undefined) ?? 0
                if (r <= 0 || r > 30) continue
                if (!log.logged_at) continue
                const d = new Date(log.logged_at)
                if (!isFinite(d.getTime())) continue

                const orm = epleyOneRM(w, r)
                if (orm <= 0) continue

                let row = byEx.get(exId)
                if (!row) {
                    row = { name, muscle, before1rm: 0, beforeWeightKg: 0, beforeReps: 0, inWeek1rm: 0, inWeekWeightKg: 0, inWeekReps: 0 }
                    byEx.set(exId, row)
                }

                const inWeek = d >= weekStart
                if (inWeek) {
                    if (orm > row.inWeek1rm || (orm === row.inWeek1rm && w > row.inWeekWeightKg)) {
                        row.inWeek1rm = orm
                        row.inWeekWeightKg = w
                        row.inWeekReps = r
                    }
                } else {
                    if (orm > row.before1rm || (orm === row.before1rm && w > row.beforeWeightKg)) {
                        row.before1rm = orm
                        row.beforeWeightKg = w
                        row.beforeReps = r
                    }
                }
            }
        }
    }

    const out: WeeklyWeightPR[] = []
    for (const [exerciseId, row] of byEx) {
        if (row.inWeek1rm <= 0 || row.before1rm <= 0) continue
        if (row.inWeek1rm <= row.before1rm) continue

        const pct = Math.round(((row.inWeek1rm - row.before1rm) / row.before1rm) * 1000) / 10

        out.push({
            exerciseId,
            exerciseName: row.name,
            muscleGroup: row.muscle,
            newWeightKg: row.inWeekWeightKg,
            newReps: row.inWeekReps,
            newOneRm: Math.round(row.inWeek1rm * 10) / 10,
            prevWeightKg: row.beforeWeightKg,
            prevReps: row.beforeReps,
            prevOneRm: Math.round(row.before1rm * 10) / 10,
            pctChange: pct,
        })
    }

    return out.sort((a, b) => b.newOneRm - a.newOneRm)
}

export type SessionTonnagePoint = {
    dateKey: string
    label: string
    tonnage: number
    sessions: number
    movingAvg?: number
}

/** Agrupa tonelaje (Σ peso×reps) por día natural del log; últimos `maxDays` con actividad. */
export function buildDailyTonnageSeries(
    workoutHistory: any[],
    maxDays = 21
): SessionTonnagePoint[] {
    const byDay = new Map<string, number>()

    for (const plan of workoutHistory || []) {
        for (const block of plan.workout_blocks || []) {
            for (const log of block.workout_logs || []) {
                const w = (log.weight_kg as number | null) ?? 0
                const r = (log.reps_done as number | null) ?? 0
                const add = w * r
                if (add <= 0 || !log.logged_at) continue
                const day = log.logged_at.slice(0, 10)
                byDay.set(day, (byDay.get(day) ?? 0) + add)
            }
        }
    }

    const sortedKeys = [...byDay.keys()].sort()
    const slice = sortedKeys.slice(-maxDays)

    const points = slice.map((dateKey) => {
        const d = new Date(dateKey + 'T12:00:00')
        const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        return {
            dateKey,
            label,
            tonnage: Math.round(byDay.get(dateKey) ?? 0),
            sessions: 1,
        }
    })

    // Media móvil de 7 sesiones (ventana centrada hacia atrás)
    const window = 7
    return points.map((pt, i) => {
        const start = Math.max(0, i - window + 1)
        const slice = points.slice(start, i + 1)
        const avg = Math.round(slice.reduce((s, p) => s + p.tonnage, 0) / slice.length)
        return { ...pt, movingAvg: avg }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC mapper — `get_client_daily_tonnage` (ORDER BY day ASC; día en Santiago).
// `moving_avg` y `sessions` ya los calcula Postgres.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila de `get_client_daily_tonnage`. */
export type DailyTonnageRpcRow = {
    /** YYYY-MM-DD en zona Santiago. */
    day: string
    tonnage: number
    sessions: number
    moving_avg: number
}

/** `get_client_daily_tonnage` → `SessionTonnagePoint[]` (mantiene el orden day ASC). */
export function mapDailyTonnageRpc(rows: DailyTonnageRpcRow[] | null): SessionTonnagePoint[] {
    if (!rows?.length) return []
    return rows.map((r) => {
        const d = new Date(r.day + 'T12:00:00')
        return {
            dateKey: r.day,
            label: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            tonnage: Math.round(r.tonnage ?? 0),
            sessions: r.sessions ?? 1,
            movingAvg: Math.round(r.moving_avg ?? 0),
        }
    })
}

export type VolumeImbalance = {
    stronger: string
    weaker: string
    ratio: number
}

/** Si el grupo con más volumen supera ≥ `minRatio`× al de menos volumen entre los top `take` grupos. */
export function detectVolumeImbalances(
    rows: MuscleVolumeRow[],
    take = 6,
    minRatio = 2
): VolumeImbalance[] {
    const list = [...(rows || [])].filter((r) => r.volume > 0)
    if (list.length < 2) return []
    const top = list.sort((a, b) => b.volume - a.volume).slice(0, take)
    const maxV = top[0]?.volume ?? 0
    const strong = top[0]?.muscleGroup ?? ''
    if (maxV <= 0 || !strong) return []

    const alerts: VolumeImbalance[] = []
    for (let i = 1; i < top.length; i++) {
        const w = top[i]!
        if (w.volume <= 0) continue
        const ratio = maxV / w.volume
        if (ratio >= minRatio) {
            alerts.push({ stronger: strong, weaker: w.muscleGroup, ratio: Math.round(ratio * 10) / 10 })
        }
    }
    return alerts
}
