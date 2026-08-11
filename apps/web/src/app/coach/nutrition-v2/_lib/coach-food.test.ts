import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Alta de alimento coach-scoped (`insertCoachFood`) — la ÚNICA implementación de la escritura
 * para la server action web del builder y el endpoint mobile `createFood`.
 *
 * Foco de esta suite: el bloque opcional "Equivalencia de porciones" (P-B,
 * specs/nutrition-custom-portions). Las 3 columnas `exchange_*` viajan en el mismo payload y
 * el grupo se verifica VISIBLE para el coach antes de escribir — el FK de `foods` acepta
 * cualquier grupo existente, incluido el custom de OTRO coach.
 */

const isExchangeGroupVisibleToActor = vi.fn(async () => true)
vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
  isExchangeGroupVisibleToActor: (...args: unknown[]) =>
    (isExchangeGroupVisibleToActor as unknown as (...a: unknown[]) => Promise<boolean>)(...args),
}))

import { CoachFoodInputSchema, insertCoachFood } from './coach-food'
import type { NutritionV2Db } from '@/app/coach/nutrition-v2/_actions/plan-persistence'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '44444444-4444-4444-8444-444444444444'
const COACH_ID = '22222222-2222-4222-8222-222222222222'

const VALID = {
  clientId: CLIENT_ID,
  name: 'Arroz integral',
  brand: null,
  unit: 'g' as const,
  calories: 350,
  proteinG: 7,
  carbsG: 77,
  fatsG: 2,
}

/** Fake mínimo del cliente RLS: captura la fila insertada y devuelve un id. */
function fakeDb() {
  const rows: Record<string, unknown>[] = []
  const db = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        rows.push(row)
        return { select: () => ({ single: async () => ({ data: { id: 'food-1' }, error: null }) }) }
      },
    }),
  } as unknown as NutritionV2Db
  return { db, rows }
}

beforeEach(() => {
  isExchangeGroupVisibleToActor.mockReset()
  isExchangeGroupVisibleToActor.mockResolvedValue(true)
})

describe('CoachFoodInputSchema · equivalencia de porciones', () => {
  it('sigue aceptando el alta sin clasificar (los 3 campos ausentes)', () => {
    expect(CoachFoodInputSchema.safeParse(VALID).success).toBe(true)
  })

  // El tab Alimentos de RN (F6.3) crea alimentos sin alumno en contexto: el insert nunca usa
  // `clientId` y el endpoint mobile autoriza por workspace, así que el schema no puede exigirlo.
  it('acepta el alta SIN clientId (el tab Alimentos del móvil no tiene alumno)', () => {
    const sinCliente: Record<string, unknown> = { ...VALID }
    delete sinCliente.clientId
    expect(CoachFoodInputSchema.safeParse(sinCliente).success).toBe(true)
    expect(CoachFoodInputSchema.safeParse({ ...VALID, clientId: undefined }).success).toBe(true)
    // Sigue siendo un uuid cuando viaja (el builder web/RN lo manda).
    expect(CoachFoodInputSchema.safeParse({ ...VALID, clientId: 'no-uuid' }).success).toBe(false)
  })

  it('acepta el trío completo y el par grupo+gramos', () => {
    expect(
      CoachFoodInputSchema.safeParse({ ...VALID, exchangeGroupId: GROUP_ID, exchangePortionGrams: 120 }).success
    ).toBe(true)
    expect(
      CoachFoodInputSchema.safeParse({
        ...VALID,
        exchangeGroupId: GROUP_ID,
        exchangePortionGrams: 120,
        exchangePortionLabel: '1 taza',
      }).success
    ).toBe(true)
  })

  it('junto-o-nada: grupo sin gramos y gramos/medida sin grupo se rechazan', () => {
    const noGrams = CoachFoodInputSchema.safeParse({ ...VALID, exchangeGroupId: GROUP_ID })
    expect(noGrams.success).toBe(false)
    expect(noGrams.error?.issues[0]?.path).toEqual(['exchangePortionGrams'])

    const noGroup = CoachFoodInputSchema.safeParse({ ...VALID, exchangePortionGrams: 120 })
    expect(noGroup.success).toBe(false)
    expect(noGroup.error?.issues[0]?.path).toEqual(['exchangeGroupId'])

    expect(CoachFoodInputSchema.safeParse({ ...VALID, exchangePortionLabel: '1 taza' }).success).toBe(false)
  })

  it('los gramos por porción deben ser > 0', () => {
    expect(
      CoachFoodInputSchema.safeParse({ ...VALID, exchangeGroupId: GROUP_ID, exchangePortionGrams: 0 }).success
    ).toBe(false)
    expect(
      CoachFoodInputSchema.safeParse({ ...VALID, exchangeGroupId: GROUP_ID, exchangePortionGrams: -1 }).success
    ).toBe(false)
  })
})

describe('insertCoachFood · columnas exchange_*', () => {
  it('sin equivalencia escribe las 3 columnas en NULL y no consulta grupos', async () => {
    const { db, rows } = fakeDb()
    const res = await insertCoachFood({ db, userId: COACH_ID, input: VALID })
    expect(res.ok).toBe(true)
    expect(rows[0]).toMatchObject({
      name: 'Arroz integral',
      coach_id: COACH_ID,
      serving_size: 100,
      exchange_group_id: null,
      exchange_portion_grams: null,
      exchange_portion_label: null,
    })
    expect(isExchangeGroupVisibleToActor).not.toHaveBeenCalled()
  })

  it('con grupo visible escribe grupo + gramos + medida casera saneada', async () => {
    const { db, rows } = fakeDb()
    const res = await insertCoachFood({
      db,
      userId: COACH_ID,
      input: {
        ...VALID,
        exchangeGroupId: GROUP_ID,
        exchangePortionGrams: 120,
        exchangePortionLabel: '  1 taza  ',
      },
    })
    expect(res.ok).toBe(true)
    expect(rows[0]).toMatchObject({
      exchange_group_id: GROUP_ID,
      exchange_portion_grams: 120,
      exchange_portion_label: '1 taza',
    })
    expect(isExchangeGroupVisibleToActor).toHaveBeenCalledTimes(1)
  })

  it('grupo AJENO (no visible) => rechazo sin escribir nada', async () => {
    isExchangeGroupVisibleToActor.mockResolvedValue(false)
    const { db, rows } = fakeDb()
    const res = await insertCoachFood({
      db,
      userId: COACH_ID,
      input: { ...VALID, exchangeGroupId: GROUP_ID, exchangePortionGrams: 120 },
    })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.code).toBe('EXCHANGE_GROUP_NOT_FOUND')
    expect(rows).toHaveLength(0)
  })

  it('payload con grupo pero sin gramos => INVALID_PAYLOAD (no llega a la DB)', async () => {
    const { db, rows } = fakeDb()
    const res = await insertCoachFood({
      db,
      userId: COACH_ID,
      input: { ...VALID, exchangeGroupId: GROUP_ID },
    })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.code).toBe('INVALID_PAYLOAD')
    expect(rows).toHaveLength(0)
    expect(isExchangeGroupVisibleToActor).not.toHaveBeenCalled()
  })
})
