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
    prevWeightKg: number
    prevReps: number
    pctChange: number | null
}

/** PR de peso en la semana calendario (lunes → hoy): supera el máximo previo registrado. */
export function findWeeklyWeightPRs(workoutHistory: any[], now: Date = new Date()): WeeklyWeightPR[] {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })

    type Agg = {
        name: string
        muscle: string
        beforeMax: number
        beforeReps: number
        inWeekMax: number
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
                if (!log.logged_at) continue
                const d = new Date(log.logged_at)
                if (!isFinite(d.getTime())) continue

                let row = byEx.get(exId)
                if (!row) {
                    row = {
                        name,
                        muscle,
                        beforeMax: 0,
                        beforeReps: 0,
                        inWeekMax: 0,
                        inWeekReps: 0,
                    }
                    byEx.set(exId, row)
                }

                const inWeek = d >= weekStart
                if (inWeek) {
                    if (w > row.inWeekMax || (w === row.inWeekMax && r > row.inWeekReps)) {
                        row.inWeekMax = w
                        row.inWeekReps = r
                    }
                } else {
                    if (w > row.beforeMax || (w === row.beforeMax && r > row.beforeReps)) {
                        row.beforeMax = w
                        row.beforeReps = r
                    }
                }
            }
        }
    }

    const out: WeeklyWeightPR[] = []
    for (const [exerciseId, row] of byEx) {
        if (row.inWeekMax <= 0) continue
        if (row.beforeMax <= 0) continue
        if (row.inWeekMax <= row.beforeMax) continue

        const pct =
            row.beforeMax > 0
                ? Math.round(((row.inWeekMax - row.beforeMax) / row.beforeMax) * 1000) / 10
                : null

        out.push({
            exerciseId,
            exerciseName: row.name,
            muscleGroup: row.muscle,
            newWeightKg: row.inWeekMax,
            newReps: row.inWeekReps,
            prevWeightKg: row.beforeMax,
            prevReps: row.beforeReps,
            pctChange: pct,
        })
    }

    return out.sort((a, b) => b.newWeightKg - a.newWeightKg)
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
