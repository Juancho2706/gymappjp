const QUEUE_KEY = 'eva:workout-offline-queue'

export type WorkoutOfflineLog = {
    blockId: string
    setNumber: number
    weightKg: number | null
    repsDone: number | null
    rpe: number | null
    rir: number | null
    planId: string
    coachSlug: string
    timestamp: number
    // ── Espejo polimórfico (specs/movida-entrenamiento, AC4) ──
    // Opcionales: los items legacy ya encolados en localStorage siguen parseando.
    actualDurationSec?: number | null
    actualDistanceM?: number | null
    actualHoldSec?: number | null
    actualAvgHr?: number | null
}

export function readWorkoutOfflineQueue(): WorkoutOfflineLog[] {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    } catch {
        return []
    }
}

export function enqueueWorkoutLog(log: WorkoutOfflineLog): void {
    const q = readWorkoutOfflineQueue()
    q.push(log)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export function writeWorkoutOfflineQueue(q: WorkoutOfflineLog[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}
