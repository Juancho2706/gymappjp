import { describe, expect, it, vi } from 'vitest'
import { countCoachClients } from './coach.repository'

/**
 * `countCoachClients` es el KPI «Alumnos» del dashboard del coach — el MISMO para web y para RN
 * (`api/mobile/coach/dashboard` reusa `getCoachDashboardDataV2WithClient`).
 *
 * Onboarding v2 (W1 F1.3): el alumno de ejemplo se VE en el directorio con su etiqueta, pero no
 * infla la cartera del coach ni el número que se lee al lado del cupo. El doble graba los filtros
 * porque el conteo real lo hace PostgREST: lo que se pinnea acá es el predicado.
 */
function makeDb(count: number | null) {
    const eqs: Array<[string, unknown]> = []
    const iss: Array<[string, unknown]> = []
    const select = vi.fn(() => builder)
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select,
        eq: (column: string, value: unknown) => {
            eqs.push([column, value])
            return builder
        },
        is: (column: string, value: unknown) => {
            iss.push([column, value])
            return builder
        },
        then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ count, error: null }).then(onFulfilled),
    })
    const db = { from: vi.fn(() => builder) }
    return { db: db as never, from: db.from, select, eqs, iss }
}

describe('countCoachClients — KPI de alumnos del dashboard', () => {
    it('standalone: is_archived=false + is_demo=false + coach_id + org/team NULL', async () => {
        const { db, from, select, eqs, iss } = makeDb(3)
        expect(await countCoachClients(db, 'coach-1', null, null)).toBe(3)

        expect(from).toHaveBeenCalledWith('clients')
        expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
        expect(eqs).toContainEqual(['is_archived', false])
        expect(eqs).toContainEqual(['is_demo', false])
        expect(eqs).toContainEqual(['coach_id', 'coach-1'])
        expect(iss).toContainEqual(['org_id', null])
        expect(iss).toContainEqual(['team_id', null])
    })

    it('el demo tampoco cuenta en el pool de un team', async () => {
        const { db, eqs } = makeDb(0)
        await countCoachClients(db, 'coach-1', null, 'team-1')
        expect(eqs).toContainEqual(['is_demo', false])
        expect(eqs).toContainEqual(['team_id', 'team-1'])
    })

    it('count null → 0', async () => {
        const { db } = makeDb(null)
        expect(await countCoachClients(db, 'coach-1', null, null)).toBe(0)
    })
})
