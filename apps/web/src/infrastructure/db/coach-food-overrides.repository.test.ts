import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  deleteCoachFoodOverride,
  findCoachFoodOverride,
  findCoachFoodOverridesByFoodIds,
  upsertCoachFoodOverride,
} from './coach-food-overrides.repository'

/**
 * Cliente falso con la FORMA de supabase-js (leccion db.rpc/this): el builder se devuelve a si
 * mismo en cada eslabon y el resultado se resuelve al final. Sin esta forma, un repository que
 * desengancha un metodo del cliente pasa el test y explota en produccion.
 */
type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }

function fakeDb(results: unknown[]) {
  const calls: Call[] = []
  let cursor = 0
  const next = () => {
    const value = results[cursor] ?? { data: null, error: null }
    cursor += 1
    return value as { data: unknown; error: { message: string } | null }
  }

  const builder = (table: string, op: string) => {
    const call: Call = { table, op, filters: {} }
    calls.push(call)
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        call.filters[column] = value
        return chain
      },
      in: (column: string, values: unknown) => {
        call.filters[column] = values
        return chain
      },
      maybeSingle: () => Promise.resolve(next()),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(next()).then(resolve),
    }
    return chain
  }

  const db = {
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      insert: (payload: unknown) => {
        const chain = builder(table, 'insert')
        calls[calls.length - 1].payload = payload
        return chain
      },
      update: (payload: unknown) => {
        const chain = builder(table, 'update')
        calls[calls.length - 1].payload = payload
        return chain
      },
      delete: () => builder(table, 'delete'),
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, calls }
}

const COACH = '7b2914a1-97e8-4ab9-90da-66e278890711'
const FOOD = '33333333-3333-4333-8333-333333333333'

const ROW = {
  food_id: FOOD,
  calories: 112,
  protein_g: 2.1,
  carbs_g: 25,
  fats_g: 0.2,
  fiber_g: 0.3,
  macros_basis: 'per_serving',
  household_label: '1 pocillo',
  household_grams: 90,
}

const VALUES = {
  calories: 112,
  proteinG: 2.1,
  carbsG: 25,
  fatsG: 0.2,
  fiberG: 0.3,
  macrosBasis: 'per_serving' as const,
  householdLabel: '1 pocillo',
  householdGrams: 90,
}

describe('coach-food-overrides.repository', () => {
  it('lee el override de un alimento acotado al coach', async () => {
    const { db, calls } = fakeDb([{ data: ROW, error: null }])
    const found = await findCoachFoodOverride(db, { coachId: COACH, foodId: FOOD })
    expect(found).toEqual(VALUES)
    expect(calls[0].filters).toEqual({ coach_id: COACH, food_id: FOOD })
  })

  it('sin fila devuelve null en vez de inventar macros', async () => {
    const { db } = fakeDb([{ data: null, error: null }])
    expect(await findCoachFoodOverride(db, { coachId: COACH, foodId: FOOD })).toBeNull()
  })

  it('el lote resuelve en UN round-trip y deduplica los ids', async () => {
    const { db, calls } = fakeDb([{ data: [ROW], error: null }])
    const index = await findCoachFoodOverridesByFoodIds(db, { coachId: COACH, foodIds: [FOOD, FOOD] })
    expect(index.get(FOOD)?.calories).toBe(112)
    expect(calls).toHaveLength(1)
    expect(calls[0].filters.food_id).toEqual([FOOD])
  })

  it('sin alimentos no toca la base', async () => {
    const { db, calls } = fakeDb([])
    expect((await findCoachFoodOverridesByFoodIds(db, { coachId: COACH, foodIds: [] })).size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('con fila previa actualiza SOLO columnas de valor (la identidad no se toca)', async () => {
    const { db, calls } = fakeDb([
      { data: { id: 'row-1' }, error: null },
      { data: { id: 'row-1' }, error: null },
    ])
    const res = await upsertCoachFoodOverride(db, { coachId: COACH, foodId: FOOD, values: VALUES })
    expect(res).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({
      calories: 112,
      protein_g: 2.1,
      carbs_g: 25,
      fats_g: 0.2,
      fiber_g: 0.3,
      macros_basis: 'per_serving',
      household_label: '1 pocillo',
      household_grams: 90,
    })
    expect(Object.keys(update?.payload as object)).not.toContain('coach_id')
    expect(Object.keys(update?.payload as object)).not.toContain('food_id')
  })

  it('sin fila previa inserta con el dueño y la base declarada', async () => {
    const { db, calls } = fakeDb([
      { data: null, error: null },
      { data: { id: 'row-2' }, error: null },
    ])
    await upsertCoachFoodOverride(db, { coachId: COACH, foodId: FOOD, values: VALUES, createdBy: COACH })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert?.payload).toMatchObject({
      coach_id: COACH,
      food_id: FOOD,
      created_by: COACH,
      macros_basis: 'per_serving',
    })
  })

  it('un error de escritura vuelve como fallo, no como exito silencioso', async () => {
    const { db } = fakeDb([
      { data: null, error: null },
      { data: null, error: { message: 'new row violates row-level security policy' } },
    ])
    const res = await upsertCoachFoodOverride(db, { coachId: COACH, foodId: FOOD, values: VALUES })
    expect(res.ok).toBe(false)
  })

  it('restaurar el original borra acotado al coach y 0 filas NO es error', async () => {
    const { db, calls } = fakeDb([{ data: null, error: null }])
    const res = await deleteCoachFoodOverride(db, { coachId: COACH, foodId: FOOD })
    expect(res).toEqual({ ok: true })
    expect(calls[0].op).toBe('delete')
    expect(calls[0].filters).toEqual({ coach_id: COACH, food_id: FOOD })
  })
})
