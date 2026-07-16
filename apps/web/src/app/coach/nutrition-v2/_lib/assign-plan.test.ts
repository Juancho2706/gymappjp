import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import {
  MAX_ASSIGN_TARGETS,
  aggregateAssignResults,
  assignmentKeyForClient,
  buildDraftForTarget,
  validateAssignTargets,
  type AssignSourcePlan,
} from './assign-plan'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'
const FOOD = '44444444-4444-4444-8444-444444444444'

function sourcePlan(overrides: Partial<AssignSourcePlan> = {}): AssignSourcePlan {
  return {
    plan: { name: 'Plan base', strategy: 'structured' },
    timezone: 'America/Santiago',
    visibleNotes: 'Toma 2L de agua',
    permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: null, sodiumMg: null, waterMl: null },
        mealSlots: [
          {
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                foodId: FOOD,
                recipeId: null,
                name: 'Avena',
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                notes: 'sin azucar',
              },
            ],
          },
          {
            code: 'slot-2',
            name: 'Almuerzo',
            startTime: null,
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                foodId: null,
                recipeId: null,
                name: 'Ensalada libre',
                quantity: 200,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: true,
                notes: null,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('validateAssignTargets', () => {
  it('rechaza seleccion vacia', () => {
    expect(validateAssignTargets(SOURCE, [])).toMatchObject({ ok: false, code: 'NO_TARGETS' })
  })
  it('rechaza duplicados', () => {
    expect(validateAssignTargets(SOURCE, [A, A])).toMatchObject({ ok: false, code: 'DUPLICATE_TARGETS' })
  })
  it('rechaza si la fuente esta en los destinos', () => {
    expect(validateAssignTargets(SOURCE, [A, SOURCE])).toMatchObject({ ok: false, code: 'SOURCE_IN_TARGETS' })
  })
  it('rechaza sobre el tope', () => {
    const many = Array.from({ length: MAX_ASSIGN_TARGETS + 1 }, (_, i) => `id-${i}`)
    expect(validateAssignTargets(SOURCE, many)).toMatchObject({ ok: false, code: 'TOO_MANY_TARGETS' })
  })
  it('acepta una seleccion valida', () => {
    expect(validateAssignTargets(SOURCE, [A, B])).toEqual({ ok: true, targets: [A, B] })
  })
})

describe('assignmentKeyForClient', () => {
  it('es estable para los mismos inputs y distinta por alumno', () => {
    const k1 = assignmentKeyForClient({ operationId: 'op-1234567', targetClientId: A })
    const k1b = assignmentKeyForClient({ operationId: 'op-1234567', targetClientId: A })
    const k2 = assignmentKeyForClient({ operationId: 'op-1234567', targetClientId: B })
    expect(k1).toBe(k1b)
    expect(k1).not.toBe(k2)
  })
})

describe('buildDraftForTarget', () => {
  it('conserva franjas e items y apunta al alumno destino', () => {
    const res = buildDraftForTarget({ source: sourcePlan(), targetClientId: A, effectiveFrom: '2026-07-20', planId: null })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { draft } = res
    expect(draft.clientId).toBe(A)
    expect(draft.planId).toBeUndefined()
    expect(draft.strategy).toBe('structured')
    expect(draft.visibleNotes).toBe('Toma 2L de agua')
    expect(draft.privateNotes).toBeNull()
    expect(draft.protocolNotes).toBeNull()
    expect(draft.dayVariants).toHaveLength(1)
    const slots = draft.dayVariants[0].mealSlots
    expect(slots).toHaveLength(2)
    expect(slots[0].items[0]).toMatchObject({ foodId: FOOD, customName: null, quantity: 80, unit: 'g', notes: 'sin azucar' })
    expect(slots[1].items[0]).toMatchObject({ foodId: null, customName: 'Ensalada libre', optional: true })
    // el draft copiado respeta el contrato canonico
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('anexa version cuando se pasa planId', () => {
    const res = buildDraftForTarget({ source: sourcePlan(), targetClientId: A, effectiveFrom: '2026-07-20', planId: 'plan-x' })
    expect(res.ok && res.draft.planId).toBe('plan-x')
  })

  it('falla amable si la fuente no tiene plan', () => {
    const res = buildDraftForTarget({ source: sourcePlan({ plan: null }), targetClientId: A, effectiveFrom: '2026-07-20' })
    expect(res).toMatchObject({ ok: false, code: 'NO_SOURCE_PLAN' })
  })
})

describe('aggregateAssignResults', () => {
  it('cuenta exitosos y fallidos', () => {
    const summary = aggregateAssignResults([
      { clientId: A, ok: true, versionId: 'v1' },
      { clientId: B, ok: false, error: 'x' },
    ])
    expect(summary).toEqual({ total: 2, succeeded: 1, failed: 1 })
  })
})
