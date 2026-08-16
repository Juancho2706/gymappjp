import { describe, expect, it } from 'vitest'
import {
  NutritionPlanDraftSchema,
  buildTemplatePayload,
  parseTemplatePayload,
  stripDraftIdentity,
} from '@eva/nutrition-v2'
import {
  assembleAndValidateDraft,
  createEmptyBuilderState,
  type BuilderState,
} from './draft-builder'
import { TEMPLATE_MODE_CLIENT_ID } from '../../../_lib/template-mode'
import {
  attachPortionsAndValidate,
  portionsKey,
  variantPortionKeys,
  type PortionsBySlot,
} from '../_components/portions-state'

/**
 * EDITAR una plantilla en el builder de plantillas (`?template=<id>`).
 *
 * El invariante que sostiene la feature: abrir una plantilla y volver a guardarla SIN tocar
 * nada tiene que dejar el MISMO draft. Si no se cumple, cada vez que el coach entra a mirar
 * su plantilla y la guarda, la plantilla se degrada un poco — y como el guardado reescribe la
 * fila entera, la degradacion es acumulativa y silenciosa.
 *
 * El camino que se recorre es exactamente el de produccion:
 *   wizard -> assembleAndValidateDraft + attachPortionsAndValidate -> buildTemplatePayload
 *   -> (columna `draft` jsonb) -> parseTemplatePayload -> payload.builder -> wizard otra vez.
 */

const FOOD_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb'
const GROUP_ID = '99999999-aaaa-4bbb-8ccc-dddddddddddd'
const TODAY = '2026-08-04'

/** Estado del wizard con un dia base + una franja: alimento del catalogo, item libre y porciones. */
function wizardState(): BuilderState {
  const empty = createEmptyBuilderState(TODAY)
  const base = empty.variants[0]
  return {
    ...empty,
    strategy: 'structured',
    planName: 'Definición 2000',
    targets: { calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' },
    variants: [
      {
        ...base,
        slots: [
          {
            key: 'slot-1',
            name: 'Almuerzo',
            startTime: '13:30',
            items: [
              {
                key: 'item-1',
                food: {
                  id: FOOD_ID,
                  name: 'Arroz',
                  brand: null,
                  calories: 130,
                  proteinG: 2.7,
                  carbsG: 28,
                  fatsG: 0.3,
                  fiberG: 0.4,
                  servingSize: 100,
                  servingUnit: 'g',
                  category: null,
                  media: null,
                },
                customName: null,
                quantity: '150',
                unit: 'g',
                optional: false,
                notes: null,
                customCalories: '',
                customProteinG: '',
                customCarbsG: '',
                customFatsG: '',
              },
              {
                // Item LIBRE: la razon de ser del payload `builder`. Sus macros no caben en el
                // contrato del draft, asi que solo sobreviven por ese camino.
                key: 'item-2',
                food: null,
                customName: 'Palta de la feria',
                quantity: '80',
                unit: 'g',
                optional: false,
                notes: null,
                customCalories: '160',
                customProteinG: '2',
                customCarbsG: '9',
                customFatsG: '15',
              },
            ],
          },
        ],
      },
    ],
  } as BuilderState
}

function portionsFor(state: BuilderState): PortionsBySlot {
  return {
    [portionsKey(state.variants[0].key, 'slot-1')]: [{ exchangeGroupId: GROUP_ID, portions: 2 }],
  }
}

/** Lo que hace "Guardar plantilla": ensambla el draft canonico e inyecta las porciones. */
function draftFromWizard(state: BuilderState, portions: PortionsBySlot) {
  const draft = assembleAndValidateDraft(state, {
    clientId: TEMPLATE_MODE_CLIENT_ID,
    planId: null,
  })
  return attachPortionsAndValidate(draft, variantPortionKeys(state.variants), portions)
}

describe('modo plantilla: id de relleno del alumno', () => {
  it('el uuid NIL satisface el contrato del draft (el wizard puede ensamblar sin alumno)', () => {
    const state = wizardState()
    expect(() => draftFromWizard(state, portionsFor(state))).not.toThrow()
    expect(
      NutritionPlanDraftSchema.pick({ clientId: true }).safeParse({
        clientId: TEMPLATE_MODE_CLIENT_ID,
      }).success,
    ).toBe(true)
  })

  it('el relleno NUNCA llega a la plantilla guardada', () => {
    const state = wizardState()
    const payload = buildTemplatePayload({ draft: draftFromWizard(state, portionsFor(state)) })
    expect(payload.draft).not.toHaveProperty('clientId')
    expect(JSON.stringify(payload)).not.toContain(TEMPLATE_MODE_CLIENT_ID)
  })
})

describe('editar una plantilla: carga -> builder payload -> mismo draft', () => {
  it('reabrir y volver a guardar sin tocar nada produce un draft idéntico', () => {
    const state = wizardState()
    const portions = portionsFor(state)

    // 1) Guardado inicial: lo que la columna `draft` termina conteniendo.
    const stored = buildTemplatePayload({
      draft: draftFromWizard(state, portions),
      builder: { state, portionsBySlot: portions },
    })

    // 2) Lectura (`loadPlanTemplate`): el payload vuelve validado desde la base.
    const loaded = parseTemplatePayload(JSON.parse(JSON.stringify(stored)))
    expect(loaded).not.toBeNull()

    // 3) La page usa el payload `builder` tal cual como estado inicial del wizard.
    const reopened = loaded!.builder as { state: BuilderState; portionsBySlot: PortionsBySlot }
    expect(Array.isArray(reopened.state.variants)).toBe(true)
    expect(reopened.state.variants.length).toBeGreaterThan(0)

    // 4) Guardar de nuevo: mismo camino, mismo resultado.
    const resaved = stripDraftIdentity(
      draftFromWizard(reopened.state, reopened.portionsBySlot),
    )
    expect(resaved).toEqual(loaded!.draft)
  })

  it('el item libre conserva sus macros al reabrir (lo que el contrato del draft no lleva)', () => {
    const state = wizardState()
    const portions = portionsFor(state)
    const stored = buildTemplatePayload({
      draft: draftFromWizard(state, portions),
      builder: { state, portionsBySlot: portions },
    })

    const loaded = parseTemplatePayload(JSON.parse(JSON.stringify(stored)))!
    const reopened = loaded.builder as { state: BuilderState; portionsBySlot: PortionsBySlot }
    const free = reopened.state.variants[0].slots[0].items[1]

    expect(free.customName).toBe('Palta de la feria')
    expect(free.customCalories).toBe('160')
    expect(free.customFatsG).toBe('15')
  })

  it('las porciones a elección sobreviven la ida y vuelta', () => {
    const state = wizardState()
    const portions = portionsFor(state)
    const stored = buildTemplatePayload({
      draft: draftFromWizard(state, portions),
      builder: { state, portionsBySlot: portions },
    })

    const loaded = parseTemplatePayload(JSON.parse(JSON.stringify(stored)))!
    expect(loaded.draft.dayVariants[0].mealSlots[0].exchangeTargets).toEqual([
      expect.objectContaining({ exchangeGroupId: GROUP_ID, portions: 2 }),
    ])

    const reopened = loaded.builder as { state: BuilderState; portionsBySlot: PortionsBySlot }
    expect(reopened.portionsBySlot).toEqual(portions)
  })
})
