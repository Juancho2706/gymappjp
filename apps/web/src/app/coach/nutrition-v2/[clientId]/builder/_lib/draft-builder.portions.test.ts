import { describe, it, expect } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import {
  buildExchangeTargetInsertRow,
  collectExchangeGroupIds,
  ExchangeGroupSnapshotError,
  type BuilderExchangeGroup,
  type DraftExchangeTarget,
} from './draft-builder'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const P_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function group(overrides: Partial<BuilderExchangeGroup> = {}): BuilderExchangeGroup {
  return {
    id: C_ID,
    code: 'C',
    name: 'Cereales',
    refCalories: 70,
    refProteinG: 2,
    refCarbsG: 15,
    refFatsG: 0,
    composedOf: null,
    macrosConfirmed: true,
    ...overrides,
  }
}

function target(overrides: Partial<DraftExchangeTarget> = {}): DraftExchangeTarget {
  return {
    exchangeGroupId: C_ID,
    portions: 2,
    notes: null,
    orderIndex: 0,
    ...overrides,
  }
}

const noBase = (): BuilderExchangeGroup | null => null

describe('buildExchangeTargetInsertRow — snapshot congelado (SPEC R2, criterio 2)', () => {
  it('congela code/name/ref_*/macros_confirmed del grupo simple (composed_of null)', () => {
    const row = buildExchangeTargetInsertRow({
      versionId: 'v1',
      mealSlotId: 's1',
      orderIndex: 0,
      target: target({ portions: 1.5, notes: 'con moderacion' }),
      group: group(),
      resolveBaseGroup: noBase,
    })
    expect(row.version_id).toBe('v1')
    expect(row.meal_slot_id).toBe('s1')
    expect(row.exchange_group_id).toBe(C_ID)
    expect(row.portions).toBe(1.5)
    expect(row.notes).toBe('con moderacion')
    expect(row.order_index).toBe(0)
    expect(row.snapshot_group_code).toBe('C')
    expect(row.snapshot_group_name).toBe('Cereales')
    expect(row.snapshot_ref_calories).toBe(70)
    expect(row.snapshot_ref_protein_g).toBe(2)
    expect(row.snapshot_ref_carbs_g).toBe(15)
    expect(row.snapshot_ref_fats_g).toBe(0)
    expect(row.snapshot_macros_confirmed).toBe(true)
    expect(row.snapshot_composed_of).toBeNull()
  })

  it('ENRIQUECE composed_of (LEG = 1P + 1C) con los ref_* congelados de cada base (A2)', () => {
    const leg = group({
      id: LEG_ID,
      code: 'LEG',
      name: 'Leguminosas',
      refCalories: 175,
      refProteinG: 8,
      refCarbsG: 30,
      refFatsG: 1,
      composedOf: [
        { code: 'P', portions: 1 },
        { code: 'C', portions: 1 },
      ],
    })
    const bases: Record<string, BuilderExchangeGroup> = {
      P: group({ id: P_ID, code: 'P', name: 'Proteinas', refCalories: 75, refProteinG: 7, refCarbsG: 0, refFatsG: 5 }),
      C: group(),
    }
    const row = buildExchangeTargetInsertRow({
      versionId: 'v1',
      mealSlotId: 's1',
      orderIndex: 3,
      target: target({ exchangeGroupId: LEG_ID, portions: 2 }),
      group: leg,
      resolveBaseGroup: (code) => bases[code] ?? null,
    })
    expect(row.snapshot_group_code).toBe('LEG')
    expect(row.order_index).toBe(3)
    expect(row.snapshot_composed_of).toEqual([
      { code: 'P', portions: 1, ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ])
  })

  it('Q6: mutar los ref_* del grupo Y de un base DESPUES no cambia la fila emitida', () => {
    const leg = group({
      id: LEG_ID,
      code: 'LEG',
      name: 'Leguminosas',
      refCalories: 175,
      composedOf: [{ code: 'C', portions: 1 }],
    })
    const baseC = group()
    const row = buildExchangeTargetInsertRow({
      versionId: 'v1',
      mealSlotId: 's1',
      orderIndex: 0,
      target: target({ exchangeGroupId: LEG_ID }),
      group: leg,
      resolveBaseGroup: () => baseC,
    })
    // Simula edicion del catalogo vivo despues de persistir.
    leg.refCalories = 999
    leg.name = 'CAMBIADO'
    baseC.refCarbsG = 999
    expect(row.snapshot_ref_calories).toBe(175)
    expect(row.snapshot_group_name).toBe('Leguminosas')
    expect(row.snapshot_composed_of).toEqual([
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ])
  })

  it('grupo no resuelto (null) lanza GROUP_NOT_FOUND — jamas snapshot NULL (B5)', () => {
    expect(() =>
      buildExchangeTargetInsertRow({
        versionId: 'v1',
        mealSlotId: 's1',
        orderIndex: 0,
        target: target(),
        group: null,
        resolveBaseGroup: noBase,
      }),
    ).toThrowError(ExchangeGroupSnapshotError)
    try {
      buildExchangeTargetInsertRow({
        versionId: 'v1',
        mealSlotId: 's1',
        orderIndex: 0,
        target: target({ exchangeGroupId: C_ID }),
        group: null,
        resolveBaseGroup: noBase,
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeGroupSnapshotError)
      expect((err as ExchangeGroupSnapshotError).reason).toBe('GROUP_NOT_FOUND')
      expect((err as ExchangeGroupSnapshotError).exchangeGroupId).toBe(C_ID)
    }
  })

  it('parte base de un compuesto no resuelta lanza BASE_GROUP_NOT_FOUND', () => {
    const leg = group({
      id: LEG_ID,
      code: 'LEG',
      composedOf: [{ code: 'P', portions: 1 }],
    })
    try {
      buildExchangeTargetInsertRow({
        versionId: 'v1',
        mealSlotId: 's1',
        orderIndex: 0,
        target: target({ exchangeGroupId: LEG_ID }),
        group: leg,
        resolveBaseGroup: noBase,
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeGroupSnapshotError)
      expect((err as ExchangeGroupSnapshotError).reason).toBe('BASE_GROUP_NOT_FOUND')
      expect((err as ExchangeGroupSnapshotError).baseCode).toBe('P')
    }
  })
})

describe('collectExchangeGroupIds', () => {
  it('dedupe de ids a traves de franjas y variantes; draft sin porciones ⇒ []', () => {
    const base = NutritionPlanDraftSchema.parse({
      clientId: CLIENT_ID,
      name: 'Plan',
      strategy: 'structured',
      effectiveFrom: '2026-07-20',
      permissions: {},
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los dias',
          default: true,
          targets: {},
          mealSlots: [
            {
              code: 'slot-1',
              name: 'Almuerzo',
              items: [],
              exchangeTargets: [
                { exchangeGroupId: C_ID, portions: 2 },
                { exchangeGroupId: LEG_ID, portions: 1 },
              ],
            },
            {
              code: 'slot-2',
              name: 'Cena',
              items: [],
              exchangeTargets: [{ exchangeGroupId: C_ID, portions: 1 }],
            },
          ],
        },
      ],
    })
    expect(collectExchangeGroupIds(base).sort()).toEqual([C_ID, LEG_ID].sort())

    const noPortions = NutritionPlanDraftSchema.parse({
      clientId: CLIENT_ID,
      name: 'Plan',
      strategy: 'structured',
      effectiveFrom: '2026-07-20',
      permissions: {},
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los dias',
          default: true,
          targets: {},
          mealSlots: [{ code: 'slot-1', name: 'Almuerzo', items: [] }],
        },
      ],
    })
    expect(collectExchangeGroupIds(noPortions)).toEqual([])
  })
})
