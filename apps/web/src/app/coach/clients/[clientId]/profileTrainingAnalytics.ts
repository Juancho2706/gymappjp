// Analitica de fuerza del perfil (lado WEB).
//
// El kernel PURO (epley, ranking, mappers RPC, imbalance, strengthTrend/maxOneRM) vive ahora en
// @eva/profile-analytics (fuente unica web + mobile, E3-08) y se re-exporta aca para no romper a los
// consumidores existentes. Las funciones de SHAPE ANIDADO (workout_blocks[].workout_logs[]) se
// mantienen LOCALES: operan sobre la forma que devuelve la DB web y usan date-fns — no se tocan sus
// numeros. La forma canonica del package es PLANA (WorkoutLogRow[]); estas son sus contrapartes web.

import { startOfWeek } from 'date-fns'
import { epleyOneRM } from '@eva/profile-analytics'
import type {
    ExerciseStrengthSeries,
    OneRMHistoryPoint,
    SessionTonnagePoint,
    WeeklyWeightPR,
} from '@eva/profile-analytics'

// Kernel puro compartido (single-source en @eva/profile-analytics).
export {
    epleyOneRM,
    strengthTrendDeltaKg,
    maxOneRMIndex,
    selectStrengthCardsFromSeries,
    detectVolumeImbalances,
    mapStrengthSeriesRpc,
    mapWeeklyWeightPRsRpc,
    mapDailyTonnageRpc,
} from '@eva/profile-analytics'
export type {
    OneRMHistoryPoint,
    ExerciseStrengthSeries,
    WeeklyWeightPR,
    SessionTonnagePoint,
    VolumeImbalance,
    StrengthSeriesRpcRow,
    WeeklyPrRpcRow,
    DailyTonnageRpcRow,
} from '@eva/profile-analytics'

function isKeyCompoundLift(exerciseName: string): boolean {
    const n = exerciseName.toLowerCase()
    if (n.includes('banca') || n.includes('bench') || n.includes('press')) return true
    if (n.includes('sentadilla') || n.includes('squat')) return true
    if (n.includes('muerto') || n.includes('deadlift') || n.includes('dead lift')) return true
    return false
}

/**
 * Por ejercicio y dia natural: mejor 1RM Epley del dia (si empate, mayor peso).
 * Shape ANIDADO (workout_history[].workout_blocks[].workout_logs[]).
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

/** PR de 1RM Epley en la semana calendario (lunes → hoy). Solo sets con reps ≤ 30. Shape ANIDADO. */
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

/** Agrupa tonelaje (Σ peso×reps) por dia natural del log; ultimos `maxDays` con actividad. Shape ANIDADO. */
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

    // Media movil de 7 sesiones (ventana centrada hacia atras)
    const window = 7
    return points.map((pt, i) => {
        const start = Math.max(0, i - window + 1)
        const slice = points.slice(start, i + 1)
        const avg = Math.round(slice.reduce((s, p) => s + p.tonnage, 0) / slice.length)
        return { ...pt, movingAvg: avg }
    })
}
