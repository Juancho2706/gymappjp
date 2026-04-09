import {
    differenceInDays,
    differenceInMonths,
    eachDayOfInterval,
    formatISO,
    parseISO,
    subDays,
} from 'date-fns'

/**
 * Regularidad de check-in alineada con `getClientProfileData`:
 * 100% si el último check-in (en o antes de `referenceDate`) fue hoy respecto a esa fecha;
 * baja linealmente hasta 0% a los 7 días.
 */
export function checkInRegularityPercentAsOf(
    referenceDate: Date,
    checkIns: { created_at: string }[] | null | undefined
): number {
    const refMs = referenceDate.getTime()
    if (!isFinite(refMs)) return 0

    let lastMs = 0
    for (const c of checkIns || []) {
        if (!c.created_at) continue
        const t = new Date(c.created_at).getTime()
        if (!isFinite(t) || t > refMs) continue
        if (t > lastMs) lastMs = t
    }
    if (lastMs === 0) return 0

    const daysSince = differenceInDays(referenceDate, new Date(lastMs))
    return Math.max(0, Math.round(100 - Math.min(100, (daysSince / 7) * 100)))
}

export type ProfileCalendarActivity = { date: string; count: number; level: number }

export function formatTrainingAgeLabel(subscriptionStart: string | null, fallbackCreatedAt: string): string {
    const base = subscriptionStart || fallbackCreatedAt
    if (!base) return '—'
    const start = parseISO(base.length <= 10 ? `${base}T12:00:00` : base)
    if (!isFinite(start.getTime())) return '—'
    const now = new Date()
    const months = differenceInMonths(now, start)
    if (months < 1) {
        const d = differenceInDays(now, start)
        if (d < 1) return 'Reciente'
        return `${d} día${d === 1 ? '' : 's'}`
    }
    if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`
    const y = Math.floor(months / 12)
    const m = months % 12
    const yPart = `${y} año${y === 1 ? '' : 's'}`
    if (m === 0) return yPart
    return `${yPart} y ${m} mes${m === 1 ? '' : 'es'}`
}

export function formatRelativeLastActivity(iso: string | null): string {
    if (!iso) return 'Sin actividad reciente'
    const d = new Date(iso)
    if (!isFinite(d.getTime())) return 'Sin actividad reciente'
    const days = differenceInDays(new Date(), d)
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Ayer'
    if (days < 7) return `Hace ${days} días`
    if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function buildProfileActivityCalendarData(
    workoutHistory: any[],
    checkIns: { created_at: string }[],
    daysBack = 371
): ProfileCalendarActivity[] {
    const end = new Date()
    const start = subDays(end, daysBack)
    const map = new Map<string, number>()

    for (const plan of workoutHistory || []) {
        for (const block of plan.workout_blocks || []) {
            for (const log of block.workout_logs || []) {
                if (!log.logged_at) continue
                const d = log.logged_at.slice(0, 10)
                let t: Date
                try {
                    t = parseISO(d)
                } catch {
                    continue
                }
                if (t < start || t > end) continue
                map.set(d, (map.get(d) ?? 0) + 1)
            }
        }
    }
    for (const c of checkIns || []) {
        if (!c.created_at) continue
        const d = c.created_at.slice(0, 10)
        let t: Date
        try {
            t = parseISO(d)
        } catch {
            continue
        }
        if (t < start || t > end) continue
        map.set(d, (map.get(d) ?? 0) + 2)
    }

    const max = Math.max(1, ...map.values())
    const interval = eachDayOfInterval({ start, end })
    return interval.map((day) => {
        const dateStr = formatISO(day, { representation: 'date' })
        const count = map.get(dateStr) ?? 0
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4))
        return { date: dateStr, count, level }
    })
}

/** Días consecutivos con count > 0 en fechas ISO ordenadas */
export function longestActivityStreakFromCalendar(data: ProfileCalendarActivity[]): number {
    const active = data
        .filter((a) => a.count > 0)
        .map((a) => a.date)
        .sort()
    if (active.length === 0) return 0
    let best = 1
    let cur = 1
    for (let i = 1; i < active.length; i++) {
        const a = parseISO(active[i - 1]!)
        const b = parseISO(active[i]!)
        if (differenceInDays(b, a) === 1) {
            cur++
            best = Math.max(best, cur)
        } else {
            cur = 1
        }
    }
    return best
}

export function countWorkoutDaysInRange(workoutHistory: any[], start: Date, end: Date): number {
    const set = new Set<string>()
    for (const plan of workoutHistory || []) {
        for (const block of plan.workout_blocks || []) {
            for (const log of block.workout_logs || []) {
                if (!log.logged_at) continue
                const t = new Date(log.logged_at)
                if (t >= start && t <= end) {
                    set.add(log.logged_at.slice(0, 10))
                }
            }
        }
    }
    return set.size
}
