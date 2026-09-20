import { describe, expect, it } from 'vitest'

import { CYCLE_CURSOR_FIXTURES } from './cycle-cursor.fixtures'
import {
    isoDayOfWeek,
    resolveCycleCursor,
    type CycleCompletion,
    type CycleCursorInput,
    type CycleCursorPlan,
    type CycleCursorProgram,
    type CycleCursorResult,
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

    it('C6 · último completado = índice 3 hace dos días => wrap al Día 1, y la vuelta nueva no tiene ningún done', () => {
        const result = resolveCycleCursor({
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p3', TUESDAY)],
            todayIso: THURSDAY,
        })
        expect(result.todayCycleIndex).toBe(1)
        expect(result.nextCycleIndex).toBe(2)
        // El ciclo dio la vuelta: el Día 3 cerrado pertenece a la vuelta ANTERIOR y deja de decir
        // "Hecho" (antes se pintaba `done` y la tira quedaba sin ningún "Hoy").
        expect(result.slots).toEqual([
            { planId: 'p1', cycleIndex: 1, state: 'today' },
            { planId: 'p2', cycleIndex: 2, state: 'upcoming' },
            { planId: 'p3', cycleIndex: 3, state: 'upcoming' },
        ])
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Tren «Vuelta nueva, salud y reloj» (SPEC §3.2/§3.3): la tira se pinta por VUELTA, no por la
// ventana de 30 días. Desde la 2.ª vuelta todas las tarjetas decían "Hecho" y ninguna "Hoy"
// (feedback Movens, 2026-09-19). El cursor —todo lo que NO son `slots`— queda intacto (INV-3).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const HOY = THURSDAY
const HACE1 = daysBefore(THURSDAY, 1)
const HACE2 = daysBefore(THURSDAY, 2)
const HACE3 = daysBefore(THURSDAY, 3)
const HACE4 = daysBefore(THURSDAY, 4)
const HACE5 = daysBefore(THURSDAY, 5)
const FUERA_DE_VENTANA = daysBefore(THURSDAY, 31)

/** Tira compacta `p1#1 H(fecha)` / `p2#2 ▶` / `p3#3 ·`, con las siglas de la tabla del SPEC. */
function tira(result: CycleCursorResult): string[] {
    return result.slots.map((slot) => {
        const dia = `${slot.planId}#${slot.cycleIndex}`
        if (slot.state === 'done') return `${dia} H(${slot.doneDateIso})`
        return slot.state === 'today' ? `${dia} ▶` : `${dia} ·`
    })
}

function ciclo2(over: Partial<CycleCursorProgram> = {}): CycleCursorProgram {
    return cycleProgram({ cycle_length: 2, ...over })
}

/** Entradas de la tabla de verdad, reutilizadas por los casos y por los invariantes INV-1..4. */
const ENTRADAS_TABLA_DE_VERDAD: { name: string; input: CycleCursorInput }[] = [
    {
        name: 'C24 · ciclo 2, 1.ª vuelta incompleta',
        input: { program: ciclo2(), plans: cyclePlans(2), completions: [completion('p1', HACE2)], todayIso: HOY },
    },
    {
        name: 'C25a · ciclo 2, 2.ª vuelta recién empezada',
        input: {
            program: ciclo2(),
            plans: cyclePlans(2),
            completions: [completion('p1', HACE3), completion('p2', HACE2)],
            todayIso: HOY,
        },
    },
    {
        name: 'C25b · ciclo 2, 2.ª vuelta con el Día 1 ya hecho',
        input: {
            program: ciclo2(),
            plans: cyclePlans(2),
            completions: [completion('p1', HACE3), completion('p2', HACE2), completion('p1', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C25c · ciclo 2, 3.ª vuelta',
        input: {
            program: ciclo2(),
            plans: cyclePlans(2),
            completions: [
                completion('p1', HACE5),
                completion('p2', HACE4),
                completion('p1', HACE3),
                completion('p2', HACE2),
                completion('p1', HACE1),
            ],
            todayIso: HOY,
        },
    },
    {
        name: 'C26 · ciclo 3, 1.ª vuelta cerrada HOY',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2), completion('p2', HACE1), completion('p3', HOY)],
            todayIso: HOY,
        },
    },
    {
        name: 'C27 · ciclo 3, 2.ª vuelta recién empezada',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE3), completion('p2', HACE2), completion('p3', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C28a · ciclo 3, 2.ª vuelta con el Día 1 hecho',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [
                completion('p1', HACE4),
                completion('p2', HACE3),
                completion('p3', HACE2),
                completion('p1', HACE1),
            ],
            todayIso: HOY,
        },
    },
    {
        name: 'C28b · ciclo 3, 3.ª vuelta con los Días 1 y 2 hechos',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [
                completion('p1', HACE5),
                completion('p2', HACE4),
                completion('p3', HACE3),
                completion('p1', HACE2),
                completion('p2', HACE1),
            ],
            todayIso: HOY,
        },
    },
    {
        name: 'C29 · ciclo 3, vuelta nueva cerrada HOY',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [
                completion('p1', HACE3),
                completion('p2', HACE2),
                completion('p3', HACE1),
                completion('p1', HOY),
            ],
            todayIso: HOY,
        },
    },
    {
        name: 'C30 · salta un día del ciclo',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2), completion('p3', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C31 · repite el mismo día en dos fechas seguidas',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2), completion('p1', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C32 · en progreso HOY sobre un día hecho en la vuelta ANTERIOR',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE3), completion('p2', HACE2), completion('p3', HACE1)],
            inProgress: { planId: 'p1', dateIso: HOY },
            todayIso: HOY,
        },
    },
    {
        name: 'C33a · completitudes fuera de orden de inserción',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p3', HACE3), completion('p1', HACE2), completion('p2', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C33b · una completitud fuera de la ventana de 30 días',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', FUERA_DE_VENTANA), completion('p3', HACE2)],
            todayIso: HOY,
        },
    },
    {
        name: 'C34a · ciclo de 1 día cerrado ayer',
        input: {
            program: cycleProgram({ cycle_length: 1 }),
            plans: cyclePlans(1),
            completions: [completion('p1', HACE1)],
            todayIso: HOY,
        },
    },
    {
        name: 'C34b · parcial de HOY sobre una vuelta a medias (el parcial no es completitud)',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2)],
            inProgress: { planId: 'p2', dateIso: HOY },
            todayIso: HOY,
        },
    },
    {
        name: 'V2a · ciclo 11, dos días cerrados la misma fecha, el MAYOR índice primero',
        input: {
            program: cycleProgram({ cycle_length: 11 }),
            plans: cyclePlans(11),
            completions: [
                completion('p7', '2026-07-30'),
                completion('p5', '2026-07-30'),
                completion('p4', '2026-07-30'),
                completion('p5', '2026-07-31'),
            ],
            todayIso: '2026-08-01',
        },
    },
    {
        name: 'V2b · los MISMOS datos con el menor índice primero (orden real del productor)',
        input: {
            program: cycleProgram({ cycle_length: 11 }),
            plans: cyclePlans(11),
            completions: [
                completion('p4', '2026-07-30'),
                completion('p5', '2026-07-30'),
                completion('p7', '2026-07-30'),
                completion('p5', '2026-07-31'),
            ],
            todayIso: '2026-08-01',
        },
    },
    {
        name: 'V2c · «Entrenarlo hoy» sobre un día de ESTA vuelta la reinicia',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2), completion('p2', HACE1), completion('p1', HOY)],
            todayIso: HOY,
        },
    },
    {
        name: 'V2d · en progreso HOY sobre un día hecho en ESTA vuelta (wrap con `T` pre-override)',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', HACE2), completion('p2', HACE1)],
            inProgress: { planId: 'p1', dateIso: HOY },
            todayIso: HOY,
        },
    },
]

/** Entrada por prefijo del nombre; lanza si alguien renombra un caso y deja el `it` sin insumo. */
function entrada(prefijo: string): CycleCursorInput {
    const found = ENTRADAS_TABLA_DE_VERDAD.find((caso) => caso.name.startsWith(`${prefijo} `))
    if (!found) throw new Error(`No existe la entrada ${prefijo} en ENTRADAS_TABLA_DE_VERDAD`)
    return found.input
}

describe('resolveCycleCursor — slots por VUELTA (SPEC §3.3, tabla de verdad completa)', () => {
    it('C24 · ciclo 2, 1.ª vuelta incompleta => A H · B ▶ (sin cambio respecto de hoy)', () => {
        const result = resolveCycleCursor(entrada('C24'))
        expect(result.todayPlanId).toBe('p2')
        expect(result.slots).toEqual([
            { planId: 'p1', cycleIndex: 1, state: 'done', doneDateIso: HACE2 },
            { planId: 'p2', cycleIndex: 2, state: 'today' },
        ])
    })

    it('C25 · ciclo 2 en 2.ª y 3.ª vuelta => el día que toca dice "Hoy", no "Hecho"', () => {
        // 2.ª vuelta recién empezada: ningún `done` (antes "Día A H · Día B H", sin ningún "Hoy").
        expect(tira(resolveCycleCursor(entrada('C25a')))).toEqual(['p1#1 ▶', 'p2#2 ·'])
        // Con el Día 1 ya hecho en ESTA vuelta, sólo él queda `done`, con su fecha nueva.
        expect(tira(resolveCycleCursor(entrada('C25b')))).toEqual([`p1#1 H(${HACE1})`, 'p2#2 ▶'])
        // 3.ª vuelta: idéntico, con la fecha de la última pasada por el Día 1.
        expect(tira(resolveCycleCursor(entrada('C25c')))).toEqual([`p1#1 H(${HACE1})`, 'p2#2 ▶'])
    })

    it('C26 · ciclo 3, 1.ª vuelta cerrada HOY => los tres `done` (sin cambio)', () => {
        const result = resolveCycleCursor(entrada('C26'))
        expect(result.todayState).toBe('done')
        expect(tira(result)).toEqual([`p1#1 H(${HACE2})`, `p2#2 H(${HACE1})`, `p3#3 H(${HOY})`])
    })

    it('C27 · ciclo 3, 2.ª vuelta recién empezada => 1▶ 2· 3· (antes: los tres "Hecho")', () => {
        expect(tira(resolveCycleCursor(entrada('C27')))).toEqual(['p1#1 ▶', 'p2#2 ·', 'p3#3 ·'])
    })

    it('C28 · ciclo 3, vuelta en curso => sólo los días de ESTA vuelta quedan `done`', () => {
        expect(tira(resolveCycleCursor(entrada('C28a')))).toEqual([`p1#1 H(${HACE1})`, 'p2#2 ▶', 'p3#3 ·'])
        expect(tira(resolveCycleCursor(entrada('C28b')))).toEqual([`p1#1 H(${HACE2})`, `p2#2 H(${HACE1})`, 'p3#3 ▶'])
    })

    it('C29 · ciclo 3, vuelta nueva cerrada HOY => 1H(hoy) 2· 3·', () => {
        const result = resolveCycleCursor(entrada('C29'))
        expect(result.todayState).toBe('done')
        expect(tira(result)).toEqual([`p1#1 H(${HOY})`, 'p2#2 ·', 'p3#3 ·'])
    })

    it('C30 · salta un día (1 y 3 cerrados) => el ciclo dio la vuelta: 1▶ 2· 3·', () => {
        expect(tira(resolveCycleCursor(entrada('C30')))).toEqual(['p1#1 ▶', 'p2#2 ·', 'p3#3 ·'])
    })

    it('C31 · repite el mismo día => queda la fecha MÁS RECIENTE y el cursor sigue en el Día 2', () => {
        const result = resolveCycleCursor(entrada('C31'))
        expect(result.todayPlanId).toBe('p2')
        expect(tira(result)).toEqual([`p1#1 H(${HACE1})`, 'p2#2 ▶', 'p3#3 ·'])
    })

    it('C32 · en progreso HOY sobre un día de la vuelta ANTERIOR => 1▶ 2· 3·, sin hoja "Ya hiciste"', () => {
        const result = resolveCycleCursor(entrada('C32'))
        expect(result.todayState).toBe('in_progress')
        expect(result.todayPlanId).toBe('p1')
        expect(tira(result)).toEqual(['p1#1 ▶', 'p2#2 ·', 'p3#3 ·'])
    })

    it('C33 · orden de inserción y ventana de 30 días', () => {
        // Fuera de orden: manda la FECHA, no el orden en que llegan las completitudes.
        expect(tira(resolveCycleCursor(entrada('C33a')))).toEqual([`p1#1 H(${HACE2})`, `p2#2 H(${HACE1})`, 'p3#3 ▶'])
        // La de hace 31 días no participa, y la del Día 3 es de la vuelta anterior.
        expect(tira(resolveCycleCursor(entrada('C33b')))).toEqual(['p1#1 ▶', 'p2#2 ·', 'p3#3 ·'])
    })

    it('C34 · ciclo de 1 día y parcial pasado', () => {
        // Ciclo de 1: el día vuelve a tocar HOY ⇒ "Hoy", nunca "Hecho" sin ningún "Hoy".
        expect(tira(resolveCycleCursor(entrada('C34a')))).toEqual(['p1#1 ▶'])
        // El parcial no es completitud: el Día 1 sigue `done` y el Día 2 es el de hoy.
        expect(tira(resolveCycleCursor(entrada('C34b')))).toEqual([`p1#1 H(${HACE2})`, 'p2#2 ▶', 'p3#3 ·'])
    })
})

describe('resolveCycleCursor — orden canónico y wrap (las cuatro filas del veredicto 2)', () => {
    it('V2a/V2b · dos días cerrados la misma fecha: el resultado NO depende del orden del productor', () => {
        const mayorPrimero = resolveCycleCursor(entrada('V2a'))
        const menorPrimero = resolveCycleCursor(entrada('V2b'))
        // Caso real de LIVE: {4,5,7}@30-07 + 5@31-07, hoy 01-08 ⇒ `done` = sólo el Día 5.
        expect(mayorPrimero.todayCycleIndex).toBe(6)
        expect(mayorPrimero.slots.filter((s) => s.state === 'done')).toEqual([
            { planId: 'p5', cycleIndex: 5, state: 'done', doneDateIso: '2026-07-31' },
        ])
        // El 4 y el 7 pasan a "Próximo": son de la vuelta anterior.
        expect(mayorPrimero.slots.find((s) => s.planId === 'p4')?.state).toBe('upcoming')
        expect(mayorPrimero.slots.find((s) => s.planId === 'p7')?.state).toBe('upcoming')
        expect(mayorPrimero.slots.find((s) => s.planId === 'p6')?.state).toBe('today')
        expect(menorPrimero.slots).toEqual(mayorPrimero.slots)
    })

    it('V2c · «Entrenarlo hoy» sobre un día de esta vuelta la REINICIA: 1H(hoy) 2· 3·', () => {
        const result = resolveCycleCursor(entrada('V2c'))
        expect(result.todayState).toBe('done')
        expect(result.todayPlanId).toBe('p1')
        expect(tira(result)).toEqual([`p1#1 H(${HOY})`, 'p2#2 ·', 'p3#3 ·'])
    })

    it('V2d · wrap con `T` PRE-override: 1▶ 2H(d2) 3·, nunca 1▶ 2· 3·', () => {
        const result = resolveCycleCursor(entrada('V2d'))
        expect(result.todayState).toBe('in_progress')
        expect(result.todayPlanId).toBe('p1')
        // El día que TOCABA era el 3 (después de `p2@d2`), así que el ciclo no dio la vuelta y el
        // Día 2 sigue "Hecho". Juzgar el wrap con el día ya pisado por `inProgress` daría `2·`.
        expect(tira(result)).toEqual(['p1#1 ▶', `p2#2 H(${HACE1})`, 'p3#3 ·'])
    })
})

/** Salida del cursor SIN `slots`, serializada: es lo que D1 congela (SPEC §3.4 y §7). */
type SalidaSinSlots = Omit<CycleCursorResult, 'slots'>

function sinSlots(result: CycleCursorResult): string {
    const { slots: _slots, ...resto } = result
    return JSON.stringify(resto)
}

/**
 * GUARDA DE D1 (INV-3) — snapshot ESCRITO A MANO de la salida sin `slots` para C1–C23 y para los
 * cuatro fixtures compartidos. No es un diff automático: el "antes" ya no existe en el repo, así que
 * los valores esperados se transcribieron uno por uno desde el contrato del motor (D1 del tren
 * `ciclo-real-y-por-lado`) y se comparan **byte a byte** con `JSON.stringify` — el orden de las
 * claves del literal de salida también queda congelado. Si este bloque se pone rojo, el cambio de
 * `slots` se filtró al cursor y hay que volver atrás, no actualizar el esperado.
 */
const GUARDA_D1: { name: string; input: CycleCursorInput; esperado: SalidaSinSlots }[] = [
    {
        name: 'C1 · weekly martes',
        input: { program: weeklyProgram(), plans: WEEKLY_PLANS, completions: [], todayIso: TUESDAY },
        esperado: {
            mode: 'weekly',
            programState: 'active',
            todayPlanId: 'w2',
            todayCycleIndex: 2,
            todayState: 'todo',
            nextPlanId: 'w4',
            nextCycleIndex: 4,
        },
    },
    {
        name: 'C2 · weekly domingo sin plan',
        input: { program: weeklyProgram(), plans: WEEKLY_PLANS, completions: [], todayIso: SUNDAY },
        esperado: {
            mode: 'weekly',
            programState: 'active',
            todayPlanId: null,
            todayCycleIndex: 7,
            todayState: 'todo',
            nextPlanId: null,
            nextCycleIndex: null,
        },
    },
    {
        name: 'C2b · weekly miércoles sin plan, con siguiente',
        input: { program: weeklyProgram(), plans: WEEKLY_PLANS, completions: [], todayIso: WEDNESDAY },
        esperado: {
            mode: 'weekly',
            programState: 'active',
            todayPlanId: null,
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'w4',
            nextCycleIndex: 4,
        },
    },
    {
        name: 'C3 · weekly con completitudes e inProgress (no alteran nada)',
        input: {
            program: weeklyProgram(),
            plans: WEEKLY_PLANS,
            completions: [completion('w1', TUESDAY), completion('w2', WEDNESDAY)],
            inProgress: { planId: 'w4', dateIso: TUESDAY },
            todayIso: TUESDAY,
        },
        esperado: {
            mode: 'weekly',
            programState: 'active',
            todayPlanId: 'w2',
            todayCycleIndex: 2,
            todayState: 'todo',
            nextPlanId: 'w4',
            nextCycleIndex: 4,
        },
    },
    {
        name: 'C22 · weekly flexible sin fecha',
        input: {
            program: weeklyProgram({ start_date: null, start_date_flexible: true }),
            plans: WEEKLY_PLANS,
            completions: [],
            todayIso: TUESDAY,
        },
        esperado: {
            mode: 'weekly',
            programState: 'not_started',
            todayPlanId: 'w2',
            todayCycleIndex: 2,
            todayState: 'todo',
            nextPlanId: 'w4',
            nextCycleIndex: 4,
        },
    },
    {
        name: 'C4 · cycle sin completitudes',
        input: { program: cycleProgram(), plans: cyclePlans(3), completions: [], todayIso: THURSDAY },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'C5 · último completado = índice 1 ayer',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p2',
            todayCycleIndex: 2,
            todayState: 'todo',
            nextPlanId: 'p3',
            nextCycleIndex: 3,
            lastCompleted: { planId: 'p1', cycleIndex: 1, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C6 · último completado = índice 3 (wrap al Día 1)',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p3', TUESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
            lastCompleted: { planId: 'p3', cycleIndex: 3, dateIso: TUESDAY },
        },
    },
    {
        name: 'C7 y C23 · completado HOY el índice 2',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY), completion('p2', THURSDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p2',
            todayCycleIndex: 2,
            todayState: 'done',
            nextPlanId: 'p3',
            nextCycleIndex: 3,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: THURSDAY },
        },
    },
    {
        name: 'C8 · empezado hoy y sin cerrar',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            inProgress: { planId: 'p2', dateIso: THURSDAY },
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p2',
            todayCycleIndex: 2,
            todayState: 'in_progress',
            nextPlanId: 'p3',
            nextCycleIndex: 3,
            lastCompleted: { planId: 'p1', cycleIndex: 1, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C8b · inProgress de OTRO día',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', WEDNESDAY)],
            inProgress: { planId: 'p3', dateIso: WEDNESDAY },
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p2',
            todayCycleIndex: 2,
            todayState: 'todo',
            nextPlanId: 'p3',
            nextCycleIndex: 3,
            lastCompleted: { planId: 'p1', cycleIndex: 1, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C9 · empate de fecha => gana el mayor índice',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', WEDNESDAY), completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C10 · último completado hace 25 días (dentro de la ventana)',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', daysBefore(THURSDAY, 25))],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: daysBefore(THURSDAY, 25) },
        },
    },
    {
        name: 'C11 · nada dentro de la ventana de 30 días',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p2', daysBefore(THURSDAY, 45))],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'C12 · ciclo de 1 día sin logs',
        input: {
            program: cycleProgram({ cycle_length: 1 }),
            plans: cyclePlans(1),
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
        },
    },
    {
        name: 'C12b · ciclo de 1 día cerrado HOY',
        input: {
            program: cycleProgram({ cycle_length: 1 }),
            plans: cyclePlans(1),
            completions: [completion('p1', THURSDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'done',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p1', cycleIndex: 1, dateIso: THURSDAY },
        },
    },
    {
        name: 'C13 · ciclo de 8, cerrado el índice 8',
        input: {
            program: cycleProgram({ cycle_length: 8 }),
            plans: cyclePlans(8),
            completions: [completion('p8', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
            lastCompleted: { planId: 'p8', cycleIndex: 8, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C14 · ciclo de 14, cerrado el índice 7',
        input: {
            program: cycleProgram({ cycle_length: 14 }),
            plans: cyclePlans(14),
            completions: [completion('p7', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p8',
            todayCycleIndex: 8,
            todayState: 'todo',
            nextPlanId: 'p9',
            nextCycleIndex: 9,
            lastCompleted: { planId: 'p7', cycleIndex: 7, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C15 · días 1 y 2 cerrados anteayer/ayer',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('p1', TUESDAY), completion('p2', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C16 · sin plan para el índice calculado (salta al siguiente)',
        input: {
            program: cycleProgram(),
            plans: [
                { id: 'p1', day_of_week: 1, title: 'Día 1' },
                { id: 'p3', day_of_week: 3, title: 'Día 3' },
            ],
            completions: [completion('p1', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p1', cycleIndex: 1, dateIso: WEDNESDAY },
        },
    },
    {
        name: 'C19 · plan sin bloques ausente, sin completitudes',
        input: {
            program: cycleProgram(),
            plans: [
                { id: 'p1', day_of_week: 1, title: 'Día 1' },
                { id: 'p3', day_of_week: 3, title: 'Día 3' },
            ],
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p3',
            nextCycleIndex: 3,
        },
    },
    {
        name: 'C18 · planes ya filtrados por variante',
        input: {
            program: cycleProgram(),
            plans: [
                { id: 'a1', day_of_week: 1, title: 'A · Día 1' },
                { id: 'a2', day_of_week: 2, title: 'A · Día 2' },
                { id: 'a3', day_of_week: 3, title: 'A · Día 3' },
            ],
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'a1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'a2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'completitud de un plan que ya no está',
        input: {
            program: cycleProgram(),
            plans: cyclePlans(3),
            completions: [completion('plan-borrado', WEDNESDAY)],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'programa sin planes cargados',
        input: { program: cycleProgram(), plans: [], completions: [], todayIso: THURSDAY },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: null,
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: null,
            nextCycleIndex: null,
        },
    },
    {
        name: 'C20 · cycle flexible sin fecha',
        input: {
            program: cycleProgram({ start_date: null, start_date_flexible: true }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'not_started',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'C21a · flexible CON fecha => active',
        input: {
            program: cycleProgram({ start_date: '2026-08-24', start_date_flexible: true }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'C21b · no flexible SIN fecha => active',
        input: {
            program: cycleProgram({ start_date: null, start_date_flexible: false }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
    {
        name: 'C21c · sin flag ni fecha => active',
        input: {
            program: cycleProgram({ start_date: null, start_date_flexible: null }),
            plans: cyclePlans(3),
            completions: [],
            todayIso: THURSDAY,
        },
        esperado: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
        },
    },
]

/**
 * Los CUATRO fixtures compartidos que ya existían antes del tren, con su salida sin `slots` también
 * escrita a mano. El fixture nuevo de «2.ª vuelta» no entra acá: nació con este cambio, así que no
 * tiene un "antes" que congelar — su contrato completo (incluidos los `slots`) lo verifican
 * `cycle-completions.test.ts` y `tests/mobile/cycle-cursor-parity.test.ts`.
 */
const GUARDA_D1_FIXTURES: SalidaSinSlots[] = [
    {
        mode: 'cycle',
        programState: 'active',
        todayPlanId: 'p1',
        todayCycleIndex: 1,
        todayState: 'todo',
        nextPlanId: 'p2',
        nextCycleIndex: 2,
    },
    {
        mode: 'cycle',
        programState: 'active',
        todayPlanId: 'p3',
        todayCycleIndex: 3,
        todayState: 'todo',
        nextPlanId: 'p1',
        nextCycleIndex: 1,
        lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: '2026-09-02' },
    },
    {
        mode: 'cycle',
        programState: 'active',
        todayPlanId: 'p3',
        todayCycleIndex: 3,
        todayState: 'in_progress',
        nextPlanId: 'p1',
        nextCycleIndex: 1,
        lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: '2026-09-02' },
    },
    {
        mode: 'cycle',
        programState: 'active',
        todayPlanId: 'p3',
        todayCycleIndex: 3,
        todayState: 'done',
        nextPlanId: 'p1',
        nextCycleIndex: 1,
        lastCompleted: { planId: 'p3', cycleIndex: 3, dateIso: '2026-09-03' },
    },
]

describe('INV-3 · guarda de D1: el cursor sin `slots` queda byte a byte igual', () => {
    for (const caso of GUARDA_D1) {
        it(caso.name, () => {
            expect(sinSlots(resolveCycleCursor(caso.input))).toBe(JSON.stringify(caso.esperado))
        })
    }

    it('los cuatro fixtures compartidos tampoco mueven el cursor', () => {
        expect(CYCLE_CURSOR_FIXTURES.length).toBeGreaterThanOrEqual(GUARDA_D1_FIXTURES.length)
        GUARDA_D1_FIXTURES.forEach((esperado, i) => {
            const fixture = CYCLE_CURSOR_FIXTURES[i]
            const result = resolveCycleCursor({
                program: fixture.program,
                plans: fixture.plans,
                completions: fixture.expectedCompletions,
                inProgress: fixture.expectedInProgress,
                todayIso: fixture.todayIso,
            })
            expect(sinSlots(result)).toBe(JSON.stringify(esperado))
        })
    })
})

describe('INV-1/INV-2 · a lo sumo un `today`, y exactamente uno mientras el día no esté cerrado', () => {
    const CASOS_CICLO = [
        ...GUARDA_D1.filter((caso) => caso.input.program.program_structure_type === 'cycle'),
        ...ENTRADAS_TABLA_DE_VERDAD,
    ]

    for (const caso of CASOS_CICLO) {
        it(caso.name, () => {
            const result = resolveCycleCursor(caso.input)
            const todays = result.slots.filter((slot) => slot.state === 'today')
            // INV-1: nunca dos "Hoy" en la misma tira.
            expect(todays.length).toBeLessThanOrEqual(1)
            if (result.todayState === 'done') {
                // INV-2 (rama `done`): cero "Hoy", y el día de hoy queda `done` con la fecha de hoy.
                expect(todays).toHaveLength(0)
                const hecho = result.slots.find((slot) => slot.planId === result.todayPlanId)
                expect(hecho?.state).toBe('done')
                expect(hecho?.doneDateIso).toBe(caso.input.todayIso)
            } else if (result.todayPlanId !== null) {
                // INV-2: exactamente un "Hoy", y es el plan que el cursor señala.
                expect(todays).toHaveLength(1)
                expect(todays[0]?.planId).toBe(result.todayPlanId)
            }
            // Todo `done` trae su fecha y todo `upcoming`/`today` no la trae.
            for (const slot of result.slots) {
                if (slot.state === 'done') expect(typeof slot.doneDateIso).toBe('string')
                else expect(slot.doneDateIso).toBeUndefined()
            }
        })
    }

    it('vuelta recién empezada: ningún `done` (C27, el corazón de la queja de Movens)', () => {
        expect(resolveCycleCursor(entrada('C27')).slots.some((slot) => slot.state === 'done')).toBe(false)
    })
})

describe('INV-4 · la salida no depende del orden de entrada de las completitudes', () => {
    /** Todas las permutaciones de un arreglo chico (los casos usados tienen ≤ 5 completitudes). */
    function permutaciones<T>(items: readonly T[]): T[][] {
        if (items.length <= 1) return [[...items]]
        const out: T[][] = []
        for (let i = 0; i < items.length; i++) {
            const resto = [...items.slice(0, i), ...items.slice(i + 1)]
            for (const perm of permutaciones(resto)) out.push([items[i], ...perm])
        }
        return out
    }

    it('la propia utilidad genera n! permutaciones distintas (anti-vacuidad)', () => {
        expect(permutaciones([1, 2, 3])).toHaveLength(6)
        expect(new Set(permutaciones([1, 2, 3]).map((p) => p.join(''))).size).toBe(6)
    })

    for (const caso of ENTRADAS_TABLA_DE_VERDAD) {
        it(`${caso.name} — barajado da los mismos slots`, () => {
            const base = resolveCycleCursor(caso.input)
            for (const completions of permutaciones(caso.input.completions)) {
                expect(resolveCycleCursor({ ...caso.input, completions })).toEqual(base)
            }
        })
    }
})
