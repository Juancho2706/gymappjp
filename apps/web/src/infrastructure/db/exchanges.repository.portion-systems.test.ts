import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    findCoachPortionSystem,
    findExchangeGroupsForScope,
    findUsedPortionSystemsForCoach,
    mapExchangeGroupRow,
} from './exchanges.repository'

/**
 * W1.3 — productores de visibilidad del picker (DATA §7.1).
 *
 * Doble con la FORMA de supabase-js (misma leccion que `coach-food-overrides.repository.test.ts`):
 * cada eslabon devuelve el builder y el resultado se resuelve al final. Los resultados se
 * encolan POR TABLA porque las dos ramas —V2 y V1— salen en paralelo (`Promise.all`) y el
 * orden de llegada no es parte del contrato.
 *
 * Lo que cuidan estos casos, ademas del valor devuelto: que un error de lectura LANCE en vez
 * de devolver `[]`. Es la bisagra del fail-open de R14 — `[]` significa «no usa nada» y apaga
 * el bloque «Legado», asi que confundirlo con «no pude leer» esconderia grupos que el plan del
 * coach usa.
 */

type Result = { data: unknown; error: { message: string } | null }
type Call = { table: string; select: string; filters: Record<string, unknown> }

function fakeDb(results: Record<string, Result[]>) {
    const calls: Call[] = []
    const cursors: Record<string, number> = {}

    const from = (table: string) => {
        const call: Call = { table, select: '', filters: {} }
        calls.push(call)
        const next = (): Result => {
            const queue = results[table] ?? []
            const index = cursors[table] ?? 0
            cursors[table] = index + 1
            return queue[index] ?? { data: null, error: null }
        }
        const chain = {
            select: (columns: string) => {
                call.select = columns
                return chain
            },
            eq: (column: string, value: unknown) => {
                call.filters[column] = value
                return chain
            },
            neq: (column: string, value: unknown) => {
                call.filters[`${column}!neq`] = value
                return chain
            },
            in: (column: string, values: unknown) => {
                call.filters[column] = values
                return chain
            },
            is: (column: string, value: unknown) => {
                call.filters[column] = value
                return chain
            },
            or: (filter: string) => {
                call.filters.or = filter
                return chain
            },
            order: () => chain,
            limit: (rows: number) => {
                call.filters['limit'] = rows
                return chain
            },
            maybeSingle: () => Promise.resolve(next()),
            then: (resolve: (value: Result) => unknown) => Promise.resolve(next()).then(resolve),
        }
        return chain
    }

    return { db: { from } as unknown as SupabaseClient<Database>, calls }
}

const COACH = '7b2914a1-97e8-4ab9-90da-66e278890711'
const PLAN_CURRENT = '11111111-1111-4111-8111-111111111111'
const DRAFT = '22222222-2222-4222-8222-222222222222'
const OLD_PUBLISHED = '33333333-3333-4333-8333-333333333333'

const ok = (data: unknown): Result => ({ data, error: null })
const boom = (message: string): Result => ({ data: null, error: { message } })

/** Fila de `nutrition_plan_versions_v2` con su plan embebido (embed to-one). */
function version(id: string, status: string, currentPublishedVersionId: string | null) {
    return { id, status, nutrition_plans_v2: { current_published_version_id: currentPublishedVersionId } }
}

/** Fila de targets con el grupo embebido (`exchange_groups!inner(portion_system)`). */
function target(portionSystem: string | null) {
    return { exchange_groups: { portion_system: portionSystem } }
}

describe('findUsedPortionSystemsForCoach', () => {
    it('devuelve [] cuando el coach no tiene ningun target vivo', async () => {
        const { db } = fakeDb({
            nutrition_plan_versions_v2: [ok([])],
            meal_exchange_targets: [ok([])],
        })
        expect(await findUsedPortionSystemsForCoach(db, COACH)).toEqual([])
    })

    it('devuelve ["smae"] con targets SOLO en la rama V1 (S-04, builder legado)', async () => {
        const { db } = fakeDb({
            nutrition_plan_versions_v2: [ok([])],
            meal_exchange_targets: [ok([target('smae'), target('smae')])],
        })
        expect(await findUsedPortionSystemsForCoach(db, COACH)).toEqual(['smae'])
    })

    it('une las dos ramas: V2 chileno + V1 SMAE ⇒ ["cl","smae"]', async () => {
        const { db } = fakeDb({
            nutrition_plan_versions_v2: [ok([version(PLAN_CURRENT, 'published', PLAN_CURRENT)])],
            nutrition_slot_exchange_targets_v2: [ok([target('cl')])],
            meal_exchange_targets: [ok([target('smae')])],
        })
        expect(await findUsedPortionSystemsForCoach(db, COACH)).toEqual(['cl', 'smae'])
    })

    it('nunca devuelve mas de dos elementos por muchas filas que haya', async () => {
        const many = [target('smae'), target('cl'), target('smae'), target('cl'), target(null)]
        const { db } = fakeDb({
            nutrition_plan_versions_v2: [ok([version(DRAFT, 'draft', null)])],
            nutrition_slot_exchange_targets_v2: [ok(many)],
            meal_exchange_targets: [ok(many)],
        })
        const systems = await findUsedPortionSystemsForCoach(db, COACH)
        expect(systems).toHaveLength(2)
        expect([...systems].sort()).toEqual(['cl', 'smae'])
    })

    it('la ventana deja fuera las versiones publicadas VIEJAS y deja pasar los borradores', async () => {
        const { db, calls } = fakeDb({
            nutrition_plan_versions_v2: [
                ok([
                    version(PLAN_CURRENT, 'published', PLAN_CURRENT),
                    version(OLD_PUBLISHED, 'published', PLAN_CURRENT),
                    version(DRAFT, 'draft', PLAN_CURRENT),
                ]),
            ],
            nutrition_slot_exchange_targets_v2: [ok([target('cl')])],
            meal_exchange_targets: [ok([])],
        })
        await findUsedPortionSystemsForCoach(db, COACH)
        const targets = calls.find((call) => call.table === 'nutrition_slot_exchange_targets_v2')
        expect(targets?.filters.version_id).toEqual([PLAN_CURRENT, DRAFT])
    })

    it('acota por coach y por plan no archivado en la consulta de la ventana', async () => {
        const { db, calls } = fakeDb({
            nutrition_plan_versions_v2: [ok([])],
            meal_exchange_targets: [ok([])],
        })
        await findUsedPortionSystemsForCoach(db, COACH)
        const versions = calls.find((call) => call.table === 'nutrition_plan_versions_v2')
        expect(versions?.filters['nutrition_plans_v2.coach_id']).toBe(COACH)
        expect(versions?.filters['nutrition_plans_v2.lifecycle_status!neq']).toBe('archived')
        const v1 = calls.find((call) => call.table === 'meal_exchange_targets')
        expect(v1?.filters['nutrition_meals.nutrition_plans.coach_id']).toBe(COACH)
    })

    it('LANZA si falla una lectura (el borde lo traduce a fail-open, no a "no usa nada")', async () => {
        const { db } = fakeDb({
            nutrition_plan_versions_v2: [boom('timeout')],
            meal_exchange_targets: [ok([])],
        })
        await expect(findUsedPortionSystemsForCoach(db, COACH)).rejects.toThrow('timeout')
    })
})

describe('findCoachPortionSystem', () => {
    it('devuelve el set del coach', async () => {
        const { db } = fakeDb({ coaches: [ok({ portion_system: 'smae' })] })
        expect(await findCoachPortionSystem(db, COACH)).toBe('smae')
    })

    it('devuelve null si la lectura falla, si no hay fila o si el valor es desconocido', async () => {
        const failed = fakeDb({ coaches: [boom('nope')] })
        expect(await findCoachPortionSystem(failed.db, COACH)).toBe(null)
        const missing = fakeDb({ coaches: [ok(null)] })
        expect(await findCoachPortionSystem(missing.db, COACH)).toBe(null)
        const unknown = fakeDb({ coaches: [ok({ portion_system: 'xx' })] })
        expect(await findCoachPortionSystem(unknown.db, COACH)).toBe(null)
    })
})

describe('portion_system en el catalogo', () => {
    const ROW = {
        id: 'g1',
        slug: 'cereales',
        code: 'CB',
        name: 'Cereales',
        coach_id: null,
        team_id: null,
        is_system: true,
        ref_calories: 140,
        ref_protein_g: 3,
        ref_carbs_g: 30,
        ref_fats_g: 0,
        color: null,
        sort_order: 220,
        composed_of: null,
        macros_confirmed: true,
    }

    it('el mapeador propaga el set y deja `undefined` lo ausente o desconocido', () => {
        expect(mapExchangeGroupRow({ ...ROW, portion_system: 'cl' }).portionSystem).toBe('cl')
        expect(mapExchangeGroupRow({ ...ROW }).portionSystem).toBeUndefined()
        expect(mapExchangeGroupRow({ ...ROW, portion_system: 'xx' }).portionSystem).toBeUndefined()
    })

    it('el catalogo del coach pide la columna y sigue SIN filtrar por set (R13)', async () => {
        const { db, calls } = fakeDb({ exchange_groups: [ok([{ ...ROW, portion_system: 'cl' }])] })
        const groups = await findExchangeGroupsForScope(db, COACH, { orgId: null, activeTeamId: null })
        expect(groups).toHaveLength(1)
        // La columna se PIDE (es el insumo de la visibilidad del borde)…
        expect(calls[0]?.select).toContain('portion_system')

        // …y no aparece en NINGUN filtro, en ninguna de sus formas. Mirar solo el literal
        // `portion_system.eq` (la sintaxis del `.or()`) dejaba pasar la forma natural de la
        // capa DB —`.eq('portion_system', coachSystem)`, que se registra como la clave
        // `portion_system`— y con ella B-01 embarcaba con el test en verde. Se revisan clave
        // Y valor de cada filtro; el `or` del scope tiene que seguir estando, para que el
        // recorrido no sea vacio.
        const filters = calls[0]?.filters ?? {}
        expect(Object.keys(filters)).toContain('or')
        for (const [column, value] of Object.entries(filters)) {
            expect(column).not.toContain('portion_system')
            expect(String(JSON.stringify(value))).not.toContain('portion_system')
        }
    })
})
