import { beforeEach, describe, expect, it, vi } from 'vitest'

import { COACH_OWNED_PURGE_TABLES, purgeCoachOwnedRows } from './account-deletion.service'

/**
 * Unit del pre-borrado que destraba el `deleteUser` de un coach.
 *
 * El bug real: borrar la cuenta desde la web fallaba con violación de FK apenas el coach tenía
 * alimentos propios (`foods`), planes (`nutrition_plans`) o comidas guardadas (`saved_meals`) —
 * las tres constraints quedaron NO ACTION en el baseline (2239/2339/2379).
 *
 * Los dos invariantes que se pinnean acá:
 *  1. el ORDEN: `nutrition_plans` ANTES que `foods`. Los planes cascadean `nutrition_meals` →
 *     `food_items`, y `food_items_food_id_fkey` (baseline 2224) TAMBIÉN es NO ACTION: borrar
 *     `foods` primero (lo que hacía el admin) se rompe con cualquier coach que haya usado su
 *     alimento propio en una comida.
 *  2. fail-fast: si una tabla falla NO se sigue con las siguientes — un borrado parcial sobre una
 *     cuenta que igual no se va a poder eliminar es peor que un estado reintentable.
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111'

type TableError = { message: string }

function makeAdminDb(errors: Partial<Record<string, TableError>> = {}) {
    const order: string[] = []
    const eqArgs: Array<[string, unknown]> = []

    const from = vi.fn((table: string) => ({
        delete: vi.fn(() => ({
            eq: vi.fn(async (column: string, value: unknown) => {
                order.push(table)
                eqArgs.push([column, value])
                return { error: errors[table] ?? null }
            }),
        })),
    }))

    // El servicio recibe un `SupabaseClient<Database>` real; acá alcanza con el doble mínimo.
    return { adminDb: { from } as never, from, order, eqArgs }
}

describe('purgeCoachOwnedRows', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('borra las tres tablas NO ACTION filtrando por coach_id', async () => {
        const { adminDb, order, eqArgs } = makeAdminDb()

        await expect(purgeCoachOwnedRows(adminDb, COACH_ID)).resolves.toEqual({})

        expect(order).toEqual(['nutrition_plans', 'saved_meals', 'foods'])
        expect(eqArgs).toEqual([
            ['coach_id', COACH_ID],
            ['coach_id', COACH_ID],
            ['coach_id', COACH_ID],
        ])
    })

    it('el orden es el arreglo: los planes van ANTES que los alimentos (food_items es NO ACTION)', async () => {
        const { adminDb, order } = makeAdminDb()

        await purgeCoachOwnedRows(adminDb, COACH_ID)

        expect(order.indexOf('nutrition_plans')).toBeLessThan(order.indexOf('foods'))
        // La constante exportada y el orden real no pueden divergir.
        expect(order).toEqual([...COACH_OWNED_PURGE_TABLES])
    })

    it('si una tabla falla NO sigue con las siguientes y devuelve cuál se cortó', async () => {
        const { adminDb, order } = makeAdminDb({ saved_meals: { message: 'deadlock detected' } })

        await expect(purgeCoachOwnedRows(adminDb, COACH_ID)).resolves.toEqual({
            error: 'deadlock detected',
            table: 'saved_meals',
        })

        // `foods` (la tercera) nunca se tocó.
        expect(order).toEqual(['nutrition_plans', 'saved_meals'])
    })

    it('si falla la PRIMERA no se borra absolutamente nada', async () => {
        const { adminDb, order } = makeAdminDb({ nutrition_plans: { message: 'FK violation' } })

        const result = await purgeCoachOwnedRows(adminDb, COACH_ID)

        expect(result).toEqual({ error: 'FK violation', table: 'nutrition_plans' })
        expect(order).toEqual(['nutrition_plans'])
    })
})
