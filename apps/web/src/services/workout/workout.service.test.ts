import { describe, expect, it } from 'vitest'
import { resolveProgramScheduleDates, resolveStartDateFlexible } from './workout.service'

/**
 * W2.1 («Ciclo real y por lado», R2 + R21) — ancla de fechas del programa.
 *
 * El servicio no es testeable de punta a punta (Server Action con `createClient()` + RLS), así que
 * la decisión de fechas vive en `resolveProgramScheduleDates`, la función pura que usan los DOS
 * caminos que escriben `start_date`: `saveWorkoutProgramAction` (builder) y
 * `assignProgramToClientsAction` (asignar plantilla). Espejo web de
 * `apps/mobile/lib/program-persistence.ts#resolveProgramScheduleMetadata`.
 *
 * Lo que se protege acá: los ~50 programas activos que HOY tienen el flag encendido y una fecha
 * puesta la conservan — vaciarla los mandaría a «Empezar hoy» sin que nadie lo pidiera.
 */

const TODAY = '2026-09-03'

/**
 * Fin inclusivo tal como lo calcula el servicio desde siempre. La cuenta mezcla UTC (`new Date`
 * sobre `YYYY-MM-DD`) con getters locales, así que su resultado depende del TZ del proceso: en
 * Vercel (UTC) da `start + weeks*7 − 1`, en una máquina en UTC−4 da un día menos. **El tren no toca
 * esa aritmética** (no está en W2.1), así que el test la replica en vez de pinnear un literal que
 * fallaría según dónde corra. Lo que W2.1 sí fija —y lo que estos casos vigilan— es *cuándo* hay
 * fecha y cuándo no.
 */
function legacyEndDate(startDate: string, weeksToRepeat: number): string {
    const start = new Date(startDate)
    const end = new Date(start)
    end.setDate(start.getDate() + (weeksToRepeat * 7) - 1)
    return end.toISOString().split('T')[0]!
}

function schedule(overrides: Partial<Parameters<typeof resolveProgramScheduleDates>[0]> = {}) {
    return resolveProgramScheduleDates({
        isClientProgram: true,
        startDateFlexible: false,
        requestedStartDate: null,
        existingStartDate: null,
        hasExistingProgram: false,
        weeksToRepeat: 4,
        today: TODAY,
        ...overrides,
    })
}

describe('resolveStartDateFlexible — R2: el inicio flexible es opt-in', () => {
    it('sin valor explícito el programa NO es flexible', () => {
        expect(resolveStartDateFlexible(undefined)).toBe(false)
        expect(resolveStartDateFlexible(null)).toBe(false)
    })

    it('respeta el valor cuando viene', () => {
        expect(resolveStartDateFlexible(true)).toBe(true)
        expect(resolveStartDateFlexible(false)).toBe(false)
    })
})

describe('resolveProgramScheduleDates — programa NUEVO', () => {
    it('no flexible: estampa hoy y el fin inclusivo (comportamiento histórico)', () => {
        expect(schedule({ startDateFlexible: false })).toEqual({
            startDate: TODAY,
            endDate: legacyEndDate(TODAY, 4),
        })
    })

    it('flexible: nace SIN fecha, y `end_date` acompaña al NULL (R21)', () => {
        expect(schedule({ startDateFlexible: true })).toEqual({ startDate: null, endDate: null })
    })

    it('flexible con fecha pedida por el coach: manda la pedida', () => {
        // R14 acota lo que puede hacer el ALUMNO (la RPC solo acepta hoy); el coach sí puede fijarla.
        expect(schedule({ startDateFlexible: true, requestedStartDate: '2026-10-05' })).toEqual({
            startDate: '2026-10-05',
            endDate: legacyEndDate('2026-10-05', 4),
        })
    })

    it('la regla no mira la estructura: weekly y cycle dan lo mismo (R13)', () => {
        // `program_structure_type` no entra en el input a propósito — si entrara, un ciclo flexible
        // podría divergir de un weekly flexible, que es justo lo que R13 prohíbe.
        expect(schedule({ startDateFlexible: true, weeksToRepeat: 3 })).toEqual(
            schedule({ startDateFlexible: true, weeksToRepeat: 12 }),
        )
    })
})

describe('resolveProgramScheduleDates — programa EXISTENTE', () => {
    it('con fecha puesta la conserva al re-guardar, aunque sea flexible', () => {
        const kept = {
            hasExistingProgram: true,
            existingStartDate: '2026-07-01',
            weeksToRepeat: 4,
        }
        expect(schedule({ ...kept, startDateFlexible: true })).toEqual({
            startDate: '2026-07-01',
            endDate: legacyEndDate('2026-07-01', 4),
        })
        expect(schedule({ ...kept, startDateFlexible: false })).toEqual({
            startDate: '2026-07-01',
            endDate: legacyEndDate('2026-07-01', 4),
        })
    })

    it('flexible sin fecha: sigue esperando al alumno, no se le estampa hoy', () => {
        expect(schedule({ hasExistingProgram: true, startDateFlexible: true })).toEqual({
            startDate: null,
            endDate: null,
        })
    })

    it('no flexible sin fecha: se estampa hoy (camino histórico intacto)', () => {
        expect(schedule({ hasExistingProgram: true, startDateFlexible: false })).toEqual({
            startDate: TODAY,
            endDate: legacyEndDate(TODAY, 4),
        })
    })

    it('la fecha pedida explícitamente pisa a la guardada', () => {
        expect(schedule({
            hasExistingProgram: true,
            existingStartDate: '2026-07-01',
            requestedStartDate: '2026-08-10',
        })).toEqual({ startDate: '2026-08-10', endDate: legacyEndDate('2026-08-10', 4) })
    })
})

describe('resolveProgramScheduleDates — R21: `end_date` nunca queda colgado', () => {
    it('hay fin si y sólo si hay inicio, en toda la matriz', () => {
        for (const isClientProgram of [true, false]) {
            for (const startDateFlexible of [true, false]) {
                for (const hasExistingProgram of [true, false]) {
                    for (const existingStartDate of [null, '2026-07-01']) {
                        for (const requestedStartDate of [null, '2026-08-10']) {
                            const out = schedule({
                                isClientProgram,
                                startDateFlexible,
                                hasExistingProgram,
                                existingStartDate,
                                requestedStartDate,
                            })
                            expect(out.endDate === null).toBe(out.startDate === null)
                        }
                    }
                }
            }
        }
    })
})

describe('resolveProgramScheduleDates — plantillas', () => {
    it('nunca llevan fecha, ni con flag ni con fecha pedida', () => {
        expect(schedule({ isClientProgram: false })).toEqual({ startDate: null, endDate: null })
        expect(schedule({ isClientProgram: false, startDateFlexible: true })).toEqual({ startDate: null, endDate: null })
        expect(schedule({ isClientProgram: false, requestedStartDate: '2026-10-05' })).toEqual({
            startDate: null,
            endDate: null,
        })
    })
})
