import { describe, expect, it } from 'vitest'

import {
    isoDayOfWeek,
    resolveCycleCursor,
    type CycleCompletion,
    type CycleCursorPlan,
    type CycleCursorProgram,
} from './cycle-cursor'

// Calendario del test (America/Santiago): 2026-09-01 martes (ISODOW 2) · 2026-09-02 miércoles ·
// 2026-09-03 jueves · 2026-09-06 domingo (ISODOW 7). `todayIso` SIEMPRE entra por parámetro: la
// función es pura y ningún caso usa `vi.useFakeTimers()`.
const TUESDAY = '2026-09-01'
const WEDNESDAY = '2026-09-02'
const THURSDAY = '2026-09-03'
const SUNDAY = '2026-09-06'

function cycleProgram(over: Partial<CycleCursorProgram> = {}): CycleCursorProgram {
    return {
        program_structure_type: 'cycle',
        cycle_length: 3,
        start_date: '2026-08-24',
        start_date_flexible: false,
        ...over,
    }
}

function weeklyProgram(over: Partial<CycleCursorProgram> = {}): CycleCursorProgram {
    return {
        program_structure_type: 'weekly',
        cycle_length: null,
        start_date: '2026-08-24',
        start_date_flexible: false,
        ...over,
    }
}

/** Planes `p1..pn` con `day_of_week` = índice del ciclo. */
function cyclePlans(n: number): CycleCursorPlan[] {
    return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, day_of_week: i + 1, title: `Día ${i + 1}` }))
}

const WEEKLY_PLANS: CycleCursorPlan[] = [
    { id: 'w1', day_of_week: 1, title: 'Lunes' },
    { id: 'w2', day_of_week: 2, title: 'Martes' },
    { id: 'w4', day_of_week: 4, title: 'Jueves' },
]

function completion(planId: string, dateIso: string): CycleCompletion {
    return { planId, dateIso }
}

/** yyyy-mm-dd `days` días ANTES de `iso` (aritmética UTC, determinista). */
function daysBefore(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

describe('resolveCycleCursor — weekly es IDENTIDAD (no cambia ni un byte)', () => {
    it('C1 · martes con planes 1/2/4 => el plan del ISODOW 2', () => {
        const result = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        })
        expect(result.mode).toBe('weekly')
        expect(result.programState).toBe('active')
        expect(result.todayPlanId).toBe('w2')
        expect(result.todayCycleIndex).toBe(2)
        expect(result.todayState).toBe('todo')
        expect(result.nextPlanId).toBe('w4')
        expect(result.nextCycleIndex).toBe(4)
        expect(result.slots).toEqual([
            { planId: 'w1', cycleIndex: 1, state: 'upcoming' },
            { planId: 'w2', cycleIndex: 2, state: 'today' },
            { planId: 'w4', cycleIndex: 4, state: 'upcoming' },
        ])
    })

    it('C2 · domingo sin plan del día => todayPlanId null y nunca lanza', () => {
        const result = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: SUNDAY,
        })
        expect(result.todayPlanId).toBeNull()
        expect(result.todayCycleIndex).toBe(7)
        expect(result.todayState).toBe('todo')
        // Sin wrap a la semana siguiente: identidad con `heroComplianceBundle.ts:151-158`, que sólo
        // considera `day_of_week > todayDow`. El domingo no hay "siguiente" y el hero no lo promete.
        expect(result.nextPlanId).toBeNull()
        expect(result.nextCycleIndex).toBeNull()

        // Con un día posterior cargado sí aparece el siguiente ISODOW con plan.
        const desdeMiercoles = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: WEDNESDAY,
        })
        expect(desdeMiercoles.todayPlanId).toBeNull()
        expect(desdeMiercoles.nextPlanId).toBe('w4')
        expect(desdeMiercoles.nextCycleIndex).toBe(4)
    })

    it('C3 · completions que en cycle darían otro día NO alteran weekly (salida idéntica a C1)', () => {
        const base = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        })
        const conCompletitudes = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [completion('w1', TUESDAY), completion('w2', WEDNESDAY)],
            inProgress: { planId: 'w4', dateIso: TUESDAY },
            todayIso: TUESDAY,
        })
        expect(conCompletitudes).toEqual(base)
    })

    it('C22 · weekly con inicio flexible sin fecha: programState not_started, el resto idéntico', () => {
        const base = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        })
        const flexible = resolveCycleCursor({
            program: weeklyProgram({ start_date: null, start_date_flexible: true }),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        })
        expect(flexible.programState).toBe('not_started')
        expect({ ...flexible, programState: 'active' }).toEqual(base)
    })
})

describe('resolveCycleCursor — cycle: el cursor por COMPLETITUD (D1)', () => {
    it('C4 · sin completitudes => Día 1', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        expect(result.mode).toBe('cycle')
        expect(result.todayCycleIndex).toBe(1)
        expect(result.todayPlanId).toBe('p1')
        expect(result.todayState).toBe('todo')
        expect(result.nextCycleIndex).toBe(2)
        expect(result.nextPlanId).toBe('p2')
        expect(result.lastCompleted).toBeUndefined()
        expect(result.slots).toEqual([
            { planId: 'p1', cycleIndex: 1, state: 'today' },
            { planId: 'p2', cycleIndex: 2, state: 'upcoming' },
            { planId: 'p3', cycleIndex: 3, state: 'upcoming' },
        ])
    })

    it('C5 · último completado = índice 1 AYER => hoy toca el Día 2 (R11: manda la fecha)', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(2)
        expect(result.todayPlanId).toBe('p2')
        expect(result.todayState).toBe('todo')
        expect(result.nextCycleIndex).toBe(3)
        expect(result.lastCompleted).toEqual({ planId: 'p1', cycleIndex: 1, dateIso: WEDNESDAY })
    })

    it('C6 · último completado = índice 3 hace dos días => wrap al Día 1', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p3', TUESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(1)
        expect(result.nextCycleIndex).toBe(2)
    })

    it('C7 y C23 · completado HOY el índice 2 => done en el día hecho, el próximo es el 3', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY), completion('p2', THURSDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayState).toBe('done')
        expect(result.todayCycleIndex).toBe(2)
        expect(result.todayPlanId).toBe('p2')
        expect(result.nextCycleIndex).toBe(3)
        expect(result.nextPlanId).toBe('p3')
        expect(result.lastCompleted).toEqual({ planId: 'p2', cycleIndex: 2, dateIso: THURSDAY })
        expect(result.slots[1]).toEqual({ planId: 'p2', cycleIndex: 2, state: 'done', doneDateIso: THURSDAY })
    })

    it('C8 · empezado hoy y sin cerrar => in_progress en ese plan; el cursor NO adelanta', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            inProgress: { planId: 'p2', dateIso: THURSDAY },
            todayIso: THURSDAY,
        })
        expect(result.todayState).toBe('in_progress')
        expect(result.todayPlanId).toBe('p2')
        expect(result.todayCycleIndex).toBe(2)
        expect(result.slots[1]).toEqual({ planId: 'p2', cycleIndex: 2, state: 'today' })
    })

    it('C8b · un inProgress de OTRO día no mueve el cursor', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            inProgress: { planId: 'p3', dateIso: WEDNESDAY },
            todayIso: THURSDAY,
        })
        expect(result.todayState).toBe('todo')
        expect(result.todayPlanId).toBe('p2')
    })

    it('C9 · empate de fecha => gana el MAYOR índice', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', WEDNESDAY), completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(3)
        expect(result.lastCompleted).toEqual({ planId: 'p2', cycleIndex: 2, dateIso: WEDNESDAY })
    })

    it('C10 · último completado hace 25 días: la ventana de 30 d lo alcanza, no reinicia', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', daysBefore(THURSDAY, 25))],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(3)
    })

    it('C11 · nada dentro de la ventana de 30 días => Día 1 (R10: reinicio explícito, sin persistencia)', () => {
        // Regla declarada del contrato: el cursor no persiste nada, así que un alumno que vuelve tras
        // 45 días arranca de nuevo en el Día 1. No es una regresión, es el comportamiento acordado.
        const vacio = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        const fueraDeVentana = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', daysBefore(THURSDAY, 45))],
            todayIso: THURSDAY,
        })
        expect(fueraDeVentana.todayCycleIndex).toBe(1)
        expect(fueraDeVentana.lastCompleted).toBeUndefined()
        expect(fueraDeVentana).toEqual(vacio)
    })

    it('C12 · ciclo de 1 día: siempre Día 1, y tras cerrarlo el próximo sigue siendo el 1', () => {
        const program = cycleProgram({ cycle_length: 1 })
        const plans = cyclePlans(1)
        const sinLogs = resolveCycleCursor({ program, plans, completions: [], todayIso: THURSDAY })
        expect(sinLogs.todayCycleIndex).toBe(1)
        expect(sinLogs.nextCycleIndex).toBe(1)

        const cerradoHoy = resolveCycleCursor({
            program,
            plans,
            completions: [completion('p1', THURSDAY)],
            todayIso: THURSDAY,
        })
        expect(cerradoHoy.todayState).toBe('done')
        expect(cerradoHoy.todayCycleIndex).toBe(1)
        expect(cerradoHoy.nextCycleIndex).toBe(1)
    })

    it('C13 · ciclo de 8: cerrado el índice 8 => Día 1 (el módulo es sobre N, jamás sobre 7)', () => {
        const result = resolveCycleCursor({
            program: cycleProgram({ cycle_length: 8 }),
            plans: cyclePlans(8),
            completions: [completion('p8', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(1)
        expect(result.nextCycleIndex).toBe(2)
    })

    it('C14 · ciclo de 14: cerrado el índice 7 => Día 8 (jamás "Lun"), con 14 slots', () => {
        const result = resolveCycleCursor({
            program: cycleProgram({ cycle_length: 14 }),
            plans: cyclePlans(14),
            completions: [completion('p7', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(8)
        expect(result.todayPlanId).toBe('p8')
        expect(result.slots).toHaveLength(14)
    })

    it('C15 · días 1 y 2 cerrados anteayer/ayer => slots done+fecha, done+fecha, today', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', TUESDAY), completion('p2', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.slots).toEqual([
            { planId: 'p1', cycleIndex: 1, state: 'done', doneDateIso: TUESDAY },
            { planId: 'p2', cycleIndex: 2, state: 'done', doneDateIso: WEDNESDAY },
            { planId: 'p3', cycleIndex: 3, state: 'today' },
        ])
        expect(result.slots.some((s) => s.state === 'upcoming')).toBe(false)
    })

    it('C16 · sin plan para el índice calculado => el cursor SALTA al siguiente con plan (R9)', () => {
        const plans: CycleCursorPlan[] = [
            { id: 'p1', day_of_week: 1, title: 'Día 1' },
            { id: 'p3', day_of_week: 3, title: 'Día 3' },
        ]
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans,
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(3)
        expect(result.todayPlanId).toBe('p3')
        expect(result.nextCycleIndex).toBe(1)
        expect(result.nextPlanId).toBe('p1')
    })

    it('C19 · el plan SIN bloques no llega al cursor y se salta igual que C16', () => {
        // `buildCycleCompletions` no lo emite y el caller no lo pasa: no participa del ciclo.
        const plans: CycleCursorPlan[] = [
            { id: 'p1', day_of_week: 1, title: 'Día 1' },
            { id: 'p3', day_of_week: 3, title: 'Día 3' },
        ]
        const result = resolveCycleCursor({ program: cycleProgram(), plans, completions: [], todayIso: THURSDAY })
        expect(result.todayCycleIndex).toBe(1)
        expect(result.slots.map((s) => s.cycleIndex)).toEqual([1, 3])
        expect(result.slots.some((s) => s.planId === 'p2')).toBe(false)
    })

    it('C17 · pura: la misma entrada invocada dos veces devuelve lo mismo', () => {
        const input = {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        }
        expect(resolveCycleCursor(input)).toEqual(resolveCycleCursor(input))
    })

    it('C18 · planes ya filtrados por variante A/B: el cursor no re-filtra ni reordena', () => {
        const plans: CycleCursorPlan[] = [
            { id: 'a1', day_of_week: 1, title: 'A · Día 1' },
            { id: 'a2', day_of_week: 2, title: 'A · Día 2' },
            { id: 'a3', day_of_week: 3, title: 'A · Día 3' },
        ]
        const result = resolveCycleCursor({ program: cycleProgram(), plans, completions: [], todayIso: THURSDAY })
        expect(result.slots.map((s) => s.planId)).toEqual(['a1', 'a2', 'a3'])
    })

    it('completitud de un plan que ya no está en el arreglo: se ignora, no rompe el cursor', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('plan-borrado', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(1)
        expect(result.lastCompleted).toBeUndefined()
    })

    it('programa sin planes cargados: no lanza y no promete ningún día', () => {
        const result = resolveCycleCursor({ program: cycleProgram(), plans: [], completions: [], todayIso: THURSDAY })
        expect(result.todayPlanId).toBeNull()
        expect(result.nextPlanId).toBeNull()
        expect(result.slots).toEqual([])
    })
})

describe('resolveCycleCursor — programState (R30: el motor es el único dueño de "no empezó")', () => {
    it('C20 · flexible + start_date null => not_started, y el cursor IGUAL da el Día 1', () => {
        const result = resolveCycleCursor({
            program: cycleProgram({ start_date: null, start_date_flexible: true }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        expect(result.programState).toBe('not_started')
        expect(result.todayCycleIndex).toBe(1)
        expect(result.todayPlanId).toBe('p1')
        expect(result.todayState).toBe('todo')
        expect(result.slots).toEqual([
            { planId: 'p1', cycleIndex: 1, state: 'today' },
            { planId: 'p2', cycleIndex: 2, state: 'upcoming' },
            { planId: 'p3', cycleIndex: 3, state: 'upcoming' },
        ])
    })

    it('C21 · sólo la conjunción da not_started: flexible con fecha y no-flexible sin fecha son active', () => {
        const conFecha = resolveCycleCursor({
            program: cycleProgram({ start_date: '2026-08-24', start_date_flexible: true }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        const sinFechaNoFlexible = resolveCycleCursor({
            program: cycleProgram({ start_date: null, start_date_flexible: false }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        const sinFlagNiFecha = resolveCycleCursor({
            program: cycleProgram({ start_date: null, start_date_flexible: null }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        })
        expect(conFecha.programState).toBe('active')
        expect(sinFechaNoFlexible.programState).toBe('active')
        expect(sinFlagNiFecha.programState).toBe('active')
    })

    it('el campo existe en las DOS ramas (weekly y cycle): nadie lo re-deriva de start_date', () => {
        const weekly = resolveCycleCursor({
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        })
        const cycle = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [],
            todayIso: TUESDAY,
        })
        expect(weekly.programState).toBe('active')
        expect(cycle.programState).toBe('active')
    })
})

describe('resolveCycleCursor — anti-vacuidad', () => {
    it('al menos un caso cycle devuelve un índice DISTINTO del ISODOW de hoy', () => {
        // Sin esto, un cursor que devolviera siempre el día calendario pasaría toda la batería.
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        })
        expect(isoDayOfWeek(THURSDAY)).toBe(4)
        expect(result.todayCycleIndex).toBe(2)
        expect(result.todayCycleIndex).not.toBe(isoDayOfWeek(THURSDAY))
    })

    it('isoDayOfWeek: ISODOW 1..7 anclado en UTC, 0 si la fecha no existe', () => {
        expect(isoDayOfWeek('2026-09-01')).toBe(2)
        expect(isoDayOfWeek('2026-09-06')).toBe(7)
        expect(isoDayOfWeek('2026-02-30')).toBe(0)
        expect(isoDayOfWeek('no-es-fecha')).toBe(0)
    })
})
