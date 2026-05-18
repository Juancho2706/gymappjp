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
