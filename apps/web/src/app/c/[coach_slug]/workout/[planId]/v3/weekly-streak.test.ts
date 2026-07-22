import { describe, it, expect } from 'vitest'
import { computeWeeklyStreak, type WeekStatusDaySource } from './weekly-streak'

/** Semana tipo: Lun done, Mar done, Mié rest, Jue hoy, Vie upcoming, Sáb rest, Dom rest. */
const WEEK: WeekStatusDaySource[] = [
    { dayOfWeek: 1, status: 'done', isToday: false },
    { dayOfWeek: 2, status: 'done', isToday: false },
    { dayOfWeek: 3, status: 'rest', isToday: false },
    { dayOfWeek: 4, status: 'today', isToday: true },
    { dayOfWeek: 5, status: 'upcoming', isToday: false },
    { dayOfWeek: 6, status: 'rest', isToday: false },
    { dayOfWeek: 7, status: 'rest', isToday: false },
]

describe('computeWeeklyStreak', () => {
    it('cuenta done (N) y días con plan (M) e ignora descanso', () => {
        const s = computeWeeklyStreak(WEEK)
        expect(s.done).toBe(2)
        // Lun, Mar, Jue, Vie tienen plan (rest excluido) → M = 4.
        expect(s.planned).toBe(4)
        expect(s.label).toBe('2 de 4')
    })

    it('mapea estados a dots sin culpa: pending y upcoming colapsan a "todo"', () => {
        const withPending: WeekStatusDaySource[] = [
            { dayOfWeek: 1, status: 'done', isToday: false },
            { dayOfWeek: 2, status: 'pending', isToday: false },
            { dayOfWeek: 3, status: 'upcoming', isToday: false },
        ]
        const s = computeWeeklyStreak(withPending)
        expect(s.days.map((d) => d.state)).toEqual(['done', 'todo', 'todo'])
        // Un día pasado sin hacer cuenta como planificado pero jamás como "fallo" visual.
        expect(s.planned).toBe(3)
        expect(s.done).toBe(1)
        expect(s.label).toBe('1 de 3')
    })

    it('conserva el flag isToday y el estado today', () => {
        const s = computeWeeklyStreak(WEEK)
        const jue = s.days.find((d) => d.dayOfWeek === 4)!
        expect(jue.state).toBe('today')
        expect(jue.isToday).toBe(true)
    })

    it('ordena Lun→Dom de forma defensiva sin mutar la entrada', () => {
        const shuffled: WeekStatusDaySource[] = [
            { dayOfWeek: 7, status: 'rest', isToday: false },
            { dayOfWeek: 1, status: 'done', isToday: false },
            { dayOfWeek: 4, status: 'today', isToday: true },
        ]
        const snapshot = [...shuffled]
        const s = computeWeeklyStreak(shuffled)
        expect(s.days.map((d) => d.dayOfWeek)).toEqual([1, 4, 7])
        expect(shuffled).toEqual(snapshot)
    })

    it('sin días con plan (todo descanso) ⇒ label null y contadores en cero', () => {
        const allRest: WeekStatusDaySource[] = [
            { dayOfWeek: 1, status: 'rest', isToday: false },
            { dayOfWeek: 2, status: 'rest', isToday: true },
        ]
        const s = computeWeeklyStreak(allRest)
        expect(s.planned).toBe(0)
        expect(s.done).toBe(0)
        expect(s.label).toBeNull()
    })

    it('entrada vacía ⇒ estructura vacía sin romper', () => {
        const s = computeWeeklyStreak([])
        expect(s.days).toEqual([])
        expect(s.done).toBe(0)
        expect(s.planned).toBe(0)
        expect(s.label).toBeNull()
    })

    it('semana perfecta ⇒ N = M', () => {
        const perfect: WeekStatusDaySource[] = [
            { dayOfWeek: 1, status: 'done', isToday: false },
            { dayOfWeek: 2, status: 'done', isToday: false },
            { dayOfWeek: 3, status: 'done', isToday: true },
        ]
        const s = computeWeeklyStreak(perfect)
        expect(s.label).toBe('3 de 3')
        expect(s.days.every((d) => d.state === 'done')).toBe(true)
    })
})
