// Lógica PURA de asignar/archivar plan V2 del coach (RN). El módulo bajo test
// (apps/mobile/lib/nutrition-v2-assign-archive) es puro (solo @eva/nutrition-v2 + zod, sin
// supabase/RN), así que corre con el runner del repo; Vitest lo colecta por el glob `tests/**`.
// Verifica la PARIDAD 1:1 con la web (_lib/assign-plan.ts + _lib/archive-plan.ts): elegibilidad,
// validación de destinos, idempotencia estable, construcción del draft (qué copia / qué nulifica),
// el adaptador del read-model, el agregado del reporte parcial y la clasificación del archivado.
import { describe, it, expect } from 'vitest'
import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  ArchivePlanInputSchema,
  MAX_ASSIGN_TARGETS,
  aggregateAssignResults,
  assignmentKeyForClient,
  buildDraftForTarget,
  canAssignSourcePlan,
  classifyArchiveWrite,
  planReadModelToAssignSource,
  validateAssignTargets,
  type AssignSourcePlan,
} from '../apps/mobile/lib/nutrition-v2-assign-archive'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const T1 = '22222222-2222-4222-8222-222222222222'
const T2 = '33333333-3333-4333-8333-333333333333'

function sourcePlan(overrides: Partial<AssignSourcePlan> = {}): AssignSourcePlan {
  return {
    plan: { name: 'Plan base', strategy: 'structured' },
    timezone: 'America/Santiago',
    visibleNotes: 'Toma agua',
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
                foodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                recipeId: null,
                name: 'Avena',
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                notes: 'Con leche',
              },
              {
                foodId: null,
                recipeId: null,
                name: 'Cafe negro',
                quantity: 1,
                unit: 'un',
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

describe('canAssignSourcePlan', () => {
  it('true solo con plan publicado vigente + cabecera + al menos una variante', () => {
    expect(canAssignSourcePlan({ vigentePlanStatus: 'published', hasPlanStructure: true, variantCount: 1 })).toBe(true)
  })

  it('false para superseded, sin cabecera o sin variantes', () => {
    expect(canAssignSourcePlan({ vigentePlanStatus: 'superseded', hasPlanStructure: true, variantCount: 2 })).toBe(false)
    expect(canAssignSourcePlan({ vigentePlanStatus: null, hasPlanStructure: false, variantCount: 0 })).toBe(false)
    expect(canAssignSourcePlan({ vigentePlanStatus: 'published', hasPlanStructure: true, variantCount: 0 })).toBe(false)
    expect(canAssignSourcePlan({ vigentePlanStatus: 'published', hasPlanStructure: false, variantCount: 1 })).toBe(false)
  })
})

describe('validateAssignTargets', () => {
  it('rechaza selección vacía', () => {
    const res = validateAssignTargets(SOURCE, [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NO_TARGETS')
  })

  it('rechaza duplicados', () => {
    const res = validateAssignTargets(SOURCE, [T1, T1])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('DUPLICATE_TARGETS')
  })

  it('rechaza incluir al alumno fuente', () => {
    const res = validateAssignTargets(SOURCE, [T1, SOURCE])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SOURCE_IN_TARGETS')
  })

  it('rechaza superar el tope', () => {
    const many = Array.from({ length: MAX_ASSIGN_TARGETS + 1 }, (_, i) => `id-${i}`)
    const res = validateAssignTargets(SOURCE, many)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('TOO_MANY_TARGETS')
  })

  it('acepta una selección válida y la devuelve tal cual', () => {
    const res = validateAssignTargets(SOURCE, [T1, T2])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.targets).toEqual([T1, T2])
  })
})

describe('assignmentKeyForClient', () => {
  it('es estable por (operación, destino) y distinta por destino', () => {
    const a1 = assignmentKeyForClient({ operationId: 'op-abc12345', targetClientId: T1 })
    const a2 = assignmentKeyForClient({ operationId: 'op-abc12345', targetClientId: T1 })
    const b = assignmentKeyForClient({ operationId: 'op-abc12345', targetClientId: T2 })
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
  })

  it('cambia si cambia la operación', () => {
    const a = assignmentKeyForClient({ operationId: 'op-abc12345', targetClientId: T1 })
    const b = assignmentKeyForClient({ operationId: 'op-xyz98765', targetClientId: T1 })
    expect(a).not.toBe(b)
  })
})

describe('buildDraftForTarget', () => {
  it('falla sin plan fuente o sin variantes', () => {
    const noPlan = buildDraftForTarget({ source: sourcePlan({ plan: null }), targetClientId: T1, effectiveFrom: '2026-07-21' })
    expect(noPlan.ok).toBe(false)
    const noVariants = buildDraftForTarget({ source: sourcePlan({ dayVariants: [] }), targetClientId: T1, effectiveFrom: '2026-07-21' })
    expect(noVariants.ok).toBe(false)
  })

  it('sin planId => plan nuevo; copia nombre/estrategia/tz/permisos/notas visibles y nulifica privadas/protocolo', () => {
    const res = buildDraftForTarget({ source: sourcePlan(), targetClientId: T1, effectiveFrom: '2026-07-21' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { draft } = res
    expect(draft.planId).toBeUndefined()
    expect(draft.clientId).toBe(T1)
    expect(draft.name).toBe('Plan base')
    expect(draft.strategy).toBe('structured')
    expect(draft.timezone).toBe('America/Santiago')
    expect(draft.effectiveFrom).toBe('2026-07-21')
    expect(draft.visibleNotes).toBe('Toma agua')
    expect(draft.privateNotes).toBeNull()
    expect(draft.protocolNotes).toBeNull()
    expect(draft.permissions.canAdjustPrescribedQuantity).toBe(true)
  })

  it('con planId => anexa versión al plan del destino', () => {
    const res = buildDraftForTarget({ source: sourcePlan(), targetClientId: T2, effectiveFrom: '2026-07-21', planId: 'pp-1' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.draft.planId).toBe('pp-1')
  })

  it('items: alimento referenciado deja customName null; item libre conserva el nombre; substitutionGroupId siempre null', () => {
    const res = buildDraftForTarget({ source: sourcePlan(), targetClientId: T1, effectiveFrom: '2026-07-21' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const items = res.draft.dayVariants[0].mealSlots[0].items
    expect(items[0].foodId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(items[0].customName).toBeNull() // tiene foodId
    expect(items[0].notes).toBe('Con leche')
    expect(items[1].foodId).toBeNull()
    expect(items[1].customName).toBe('Cafe negro') // item libre conserva el nombre
    expect(items[0].substitutionGroupId).toBeNull()
    expect(items[1].substitutionGroupId).toBeNull()
    expect(items.map((i) => i.orderIndex)).toEqual([0, 1])
  })
})

describe('planReadModelToAssignSource', () => {
  it('mapea cabecera + variantes/franjas/items del read-model a la estructura fuente', () => {
    const plan = {
      timezone: 'America/Santiago',
      plan: { name: 'Del read-model', strategy: 'flexible' },
      visibleNotes: 'Nota visible',
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: false,
        quantityAdjustmentPercent: null,
        canSubstitute: true,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      dayVariants: [
        {
          id: 'v1',
          key: 'default',
          label: 'Todos',
          dayOfWeek: null,
          isDefault: true,
          targets: { calories: 1800, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
          mealSlots: [
            {
              id: 's1',
              code: 'slot-1',
              name: 'Almuerzo',
              startTime: '13:00',
              endTime: null,
              mode: 'anchor',
              required: true,
              instructions: 'Sin sal',
              targets: {},
              prescriptionItems: [
                {
                  id: 'i1',
                  foodId: null,
                  recipeId: null,
                  name: 'Ensalada',
                  brand: null,
                  quantity: 200,
                  unit: 'g',
                  minimumQuantity: null,
                  maximumQuantity: null,
                  optional: false,
                  substitutionGroupId: null,
                  notes: null,
                  macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
                },
              ],
            },
          ],
        },
      ],
    } as unknown as NutritionPlanReadModel

    const source = planReadModelToAssignSource(plan)
    expect(source.plan).toEqual({ name: 'Del read-model', strategy: 'flexible' })
    expect(source.timezone).toBe('America/Santiago')
    expect(source.visibleNotes).toBe('Nota visible')
    expect(source.permissions.canSubstitute).toBe(true)
    expect(source.dayVariants).toHaveLength(1)
    const slot = source.dayVariants[0].mealSlots[0]
    expect(slot.name).toBe('Almuerzo')
    expect(slot.required).toBe(true)
    expect(slot.instructions).toBe('Sin sal')
    expect(slot.prescriptionItems[0].name).toBe('Ensalada')
    expect(slot.prescriptionItems[0].quantity).toBe(200)
  })

  it('plan null => estructura fuente sin cabecera (no copiable)', () => {
    const plan = {
      timezone: 'America/Santiago',
      plan: null,
      visibleNotes: null,
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      dayVariants: [],
    } as unknown as NutritionPlanReadModel
    expect(planReadModelToAssignSource(plan).plan).toBeNull()
  })
})

describe('aggregateAssignResults', () => {
  it('cuenta exitosos y fallidos del reporte parcial', () => {
    const summary = aggregateAssignResults([
      { clientId: T1, ok: true, versionId: 'v1' },
      { clientId: T2, ok: false, error: 'La fecha de vigencia debe ser posterior a la de la version vigente.' },
    ])
    expect(summary).toEqual({ total: 2, succeeded: 1, failed: 1 })
  })

  it('lista vacía => todo en cero', () => {
    expect(aggregateAssignResults([])).toEqual({ total: 0, succeeded: 0, failed: 0 })
  })
})

describe('ArchivePlanInputSchema', () => {
  it('acepta uuids válidos', () => {
    expect(ArchivePlanInputSchema.safeParse({ clientId: SOURCE, planId: T1 }).success).toBe(true)
  })

  it('rechaza ids no-uuid antes de tocar la red', () => {
    expect(ArchivePlanInputSchema.safeParse({ clientId: 'no-uuid', planId: T1 }).success).toBe(false)
    expect(ArchivePlanInputSchema.safeParse({ clientId: SOURCE, planId: '' }).success).toBe(false)
  })
})

describe('classifyArchiveWrite', () => {
  it('42501 => SCOPE_DENIED', () => {
    expect(classifyArchiveWrite({ errorCode: '42501', rowsAffected: 0 }).code).toBe('SCOPE_DENIED')
  })

  it('otro error de DB => WRITE_FAILED', () => {
    expect(classifyArchiveWrite({ errorCode: '23505', rowsAffected: 0 }).code).toBe('WRITE_FAILED')
  })

  it('0 filas sin error => PLAN_NOT_FOUND (idempotente)', () => {
    expect(classifyArchiveWrite({ errorCode: null, rowsAffected: 0 }).code).toBe('PLAN_NOT_FOUND')
  })

  it('>=1 fila => OK', () => {
    expect(classifyArchiveWrite({ errorCode: undefined, rowsAffected: 1 }).code).toBe('OK')
  })
})
