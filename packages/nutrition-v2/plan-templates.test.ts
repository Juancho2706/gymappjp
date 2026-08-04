import { describe, expect, it } from 'vitest'
import {
  NutritionPlanTemplateDraftSchema,
  formatPlanBuilderOrigin,
  hydrateTemplateDraft,
  parsePlanBuilderOrigin,
  parseTemplatePayload,
  stripDraftIdentity,
  summarizeTemplateDraft,
} from './plan-templates'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTRO_CLIENTE = '22222222-2222-4222-8222-222222222222'

function draftDePlanPublicado() {
  return {
    planId: '33333333-3333-4333-8333-333333333333',
    versionId: '44444444-4444-4444-8444-444444444444',
    clientId: CLIENT,
    name: 'Definición 2000 kcal',
    strategy: 'structured' as const,
    effectiveFrom: '2026-07-01',
    timezone: 'America/Santiago',
    permissions: {},
    visibleNotes: 'Toma agua',
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        key: 'base',
        label: 'Base',
        dayOfWeek: null,
        default: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
        orderIndex: 0,
        mealSlots: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            code: 'desayuno',
            name: 'Desayuno',
            startTime: null,
            endTime: null,
            mode: 'anchor' as const,
            required: false,
            targets: {},
            instructions: null,
            orderIndex: 0,
            items: [
              {
                id: '77777777-7777-4777-8777-777777777777',
                foodId: '88888888-8888-4888-8888-888888888888',
                quantity: 100,
                unit: 'g',
              },
            ],
            exchangeTargets: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                exchangeGroupId: '0000e8c0-0000-0000-0000-000000000001',
                portions: 2,
                notes: null,
                orderIndex: 0,
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('stripDraftIdentity', () => {
  it('no deja NINGUN id de fila del plan (el bug caro: el builder pisaria otro plan)', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    const json = JSON.stringify(plantilla)
    expect(json).not.toContain('33333333')
    expect(json).not.toContain('44444444')
    expect(json).not.toContain(CLIENT)
    expect(json).not.toContain('55555555')
    expect(json).not.toContain('66666666')
    expect(json).not.toContain('77777777')
    expect(json).not.toContain('99999999')
  })

  it('CONSERVA las referencias al catalogo (foodId, exchangeGroupId)', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    const json = JSON.stringify(plantilla)
    expect(json).toContain('88888888-8888-4888-8888-888888888888')
    expect(json).toContain('0000e8c0-0000-0000-0000-000000000001')
  })

  it('no arrastra la fecha de entrada en vigor del plan original', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never) as Record<string, unknown>
    expect(plantilla.effectiveFrom).toBeUndefined()
  })

  it('lo que produce valida contra el schema de plantilla', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    expect(NutritionPlanTemplateDraftSchema.safeParse(plantilla).success).toBe(true)
  })
})

describe('hydrateTemplateDraft', () => {
  it('el clientId lo pone el caller, nunca el JSON guardado', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    const hidratado = hydrateTemplateDraft(plantilla, { clientId: OTRO_CLIENTE })
    expect(hidratado.clientId).toBe(OTRO_CLIENTE)
    expect(hidratado.effectiveFrom).toBeNull()
  })

  it('permite renombrar al aplicar y cae al nombre de la plantilla si viene vacio', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    expect(hydrateTemplateDraft(plantilla, { clientId: OTRO_CLIENTE, name: '  Plan Ana ' }).name).toBe('Plan Ana')
    expect(hydrateTemplateDraft(plantilla, { clientId: OTRO_CLIENTE, name: '   ' }).name).toBe('Definición 2000 kcal')
  })
})

describe('summarizeTemplateDraft', () => {
  it('resume el dia base y detecta porciones', () => {
    const plantilla = stripDraftIdentity(draftDePlanPublicado() as never)
    expect(summarizeTemplateDraft(plantilla)).toEqual({
      calories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatsG: 60,
      dayVariantCount: 1,
      mealSlotCount: 1,
      itemCount: 1,
      hasPortions: true,
    })
  })

  it('una plantilla sin comidas (caso mindgym) no revienta', () => {
    const vacia = {
      name: 'Solo macros',
      strategy: 'flexible' as const,
      timezone: 'America/Santiago',
      permissions: {},
      visibleNotes: null,
      privateNotes: null,
      protocolNotes: null,
      dayVariants: [
        { key: 'base', label: 'Base', dayOfWeek: null, default: true, targets: { calories: 1800 }, orderIndex: 0, mealSlots: [] },
      ],
    }
    const resumen = summarizeTemplateDraft(vacia as never)
    expect(resumen.mealSlotCount).toBe(0)
    expect(resumen.calories).toBe(1800)
    expect(resumen.hasPortions).toBe(false)
  })
})

describe('parsePlanBuilderOrigin', () => {
  it('acepta las dos formas validas', () => {
    expect(parsePlanBuilderOrigin(`template:${CLIENT}`)).toEqual({ kind: 'template', id: CLIENT })
    expect(parsePlanBuilderOrigin(`plan:${CLIENT}`)).toEqual({ kind: 'plan', id: CLIENT })
  })

  it('rechaza basura sin explotar (el parametro es client-controlled)', () => {
    expect(parsePlanBuilderOrigin(null)).toBeNull()
    expect(parsePlanBuilderOrigin('template:no-es-uuid')).toBeNull()
    expect(parsePlanBuilderOrigin(`otro:${CLIENT}`)).toBeNull()
    expect(parsePlanBuilderOrigin(CLIENT)).toBeNull()
  })

  it('ida y vuelta', () => {
    const origin = { kind: 'template', id: CLIENT } as const
    expect(parsePlanBuilderOrigin(formatPlanBuilderOrigin(origin))).toEqual(origin)
  })
})

/**
 * Forma EXACTA que produce el importador de las 33 plantillas V1 (F3 T5). Si el contrato del
 * draft cambia, este test avisa antes de que 33 plantillas rescatadas queden ilegibles.
 */
describe('payload del importador V1', () => {
  const importado = {
    schemaVersion: 1,
    draft: {
      name: 'Dieta Jessica',
      strategy: 'structured',
      timezone: 'America/Santiago',
      permissions: {
        canRegisterFreely: false,
        canAdjustPrescribedQuantity: false,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      visibleNotes: 'Hola 👋',
      privateNotes: null,
      protocolNotes: null,
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los días',
          dayOfWeek: null,
          default: true,
          targets: { calories: 2224, proteinG: 140, carbsG: 367, fatsG: 108, fiberG: null, sodiumMg: null, waterMl: null },
          orderIndex: 0,
          mealSlots: [
            {
              code: 'slot-1',
              name: 'Comida 1',
              startTime: null,
              endTime: null,
              mode: 'anchor',
              required: false,
              targets: {},
              instructions: null,
              orderIndex: 0,
              items: [
                {
                  foodId: 'fdaac422-2273-4e92-9174-ca8592eedd26',
                  recipeId: null,
                  customName: null,
                  quantity: 3,
                  unit: 'un',
                  minimumQuantity: null,
                  maximumQuantity: null,
                  optional: false,
                  substitutionGroupId: null,
                  notes: null,
                  orderIndex: 0,
                },
              ],
            },
          ],
        },
        {
          key: 'dow-6',
          label: 'Día 6',
          dayOfWeek: 6,
          default: false,
          targets: { calories: 2224, proteinG: 140, carbsG: 367, fatsG: 108, fiberG: null, sodiumMg: null, waterMl: null },
          orderIndex: 7,
          mealSlots: [],
        },
      ],
    },
  }

  it('valida contra el contrato guardado', () => {
    expect(parseTemplatePayload(importado)).not.toBeNull()
  })

  it('una plantilla V1 SIN comidas (caso mindgym) tambien valida', () => {
    const soloMacros = {
      ...importado,
      draft: {
        ...importado.draft,
        strategy: 'flexible',
        permissions: { ...importado.draft.permissions, canRegisterFreely: true },
        dayVariants: [{ ...importado.draft.dayVariants[0], mealSlots: [] }],
      },
    }
    expect(parseTemplatePayload(soloMacros)).not.toBeNull()
  })

  it('se puede hidratar para un alumno y resumir para la biblioteca', () => {
    const payload = parseTemplatePayload(importado)
    expect(payload).not.toBeNull()
    const hidratado = hydrateTemplateDraft(payload!.draft, { clientId: OTRO_CLIENTE })
    expect(hidratado.clientId).toBe(OTRO_CLIENTE)
    expect(summarizeTemplateDraft(payload!.draft).mealSlotCount).toBe(1)
  })
})
