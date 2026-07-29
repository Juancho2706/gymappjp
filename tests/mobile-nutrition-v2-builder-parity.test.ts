/**
 * PARIDAD DE ENVELOPE web ↔ RN del builder multi-día (FD4).
 *
 * Criterio de éxito de la ola: "el coach arma el finde clonado en la app, publica, y el envelope
 * es IDÉNTICO al del web". Este test lo fija de verdad: construye el MISMO `BuilderState` para
 * las dos implementaciones (son estructuralmente idénticas a propósito) y compara el
 * `NutritionPlanDraft` resultante.
 *
 * La única divergencia de forma entre superficies es DÓNDE se inyectan las porciones: la web
 * ensambla y después ata (`attachPortionsAndValidate`), RN las cuelga dentro de `assembleDraft`
 * con la misma clave compuesta. Este test prueba que ambos caminos convergen en el mismo objeto.
 */

import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import {
  assembleDraft as rnAssembleDraft,
  builderReducer as rnReducer,
  createEmptyBuilderState as rnCreateEmpty,
  type BuilderFood as RnBuilderFood,
  type BuilderState as RnBuilderState,
} from '../apps/mobile/lib/nutrition-v2-builder'
import { portionsKey as rnPortionsKey } from '../apps/mobile/lib/nutrition-v2-builder-portions'
import {
  assembleDraft as webAssembleDraft,
  builderReducer as webReducer,
  createEmptyBuilderState as webCreateEmpty,
  type BuilderFood as WebBuilderFood,
  type BuilderState as WebBuilderState,
} from '../apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder'
import {
  attachPortionsAndValidate,
  portionsKey as webPortionsKey,
  variantPortionKeys,
  type PortionsBySlot,
} from '../apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/portions-state'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'
const SUB_FOOD_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const FOOD: RnBuilderFood & WebBuilderFood = {
  id: FOOD_ID,
  name: 'Pollo',
  brand: null,
  calories: 100,
  proteinG: 10,
  carbsG: 20,
  fatsG: 5,
  fiberG: 2,
  servingSize: 50,
  servingUnit: 'g',
  category: null,
  media: null,
}

const SUB_FOOD: RnBuilderFood & WebBuilderFood = { ...FOOD, id: SUB_FOOD_ID, name: 'Pavo' }

/**
 * Construye el MISMO plan en ambas superficies con las MISMAS keys: estrategia structured,
 * metas del base, un item con reemplazo, y el "finde clonado" (sábado + domingo desde el base)
 * con objetivos propios en el domingo. Las acciones son idénticas porque los dos reducers
 * comparten contrato.
 */
function buildScript<S>(
  createEmpty: (from: string) => S,
  reduce: (state: S, action: never) => S,
  food: RnBuilderFood & WebBuilderFood,
): S {
  const act = (state: S, action: unknown): S => reduce(state, action as never)
  let state = createEmpty('2026-07-20')
  state = act(state, { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'slot-a' })
  state = act(state, { type: 'SET_PLAN_NAME', value: 'Plan del finde' })
  state = act(state, { type: 'SET_TARGET', field: 'calories', value: '2000' })
  state = act(state, { type: 'SET_TARGET', field: 'proteinG', value: '150' })
  state = act(state, { type: 'UPDATE_SLOT', variantKey: 'default', slotKey: 'slot-a', patch: { name: 'Desayuno', startTime: '08:00' } })
  state = act(state, { type: 'ADD_ITEM', variantKey: 'default', slotKey: 'slot-a', key: 'item-1', food })
  state = act(state, { type: 'UPDATE_ITEM', variantKey: 'default', slotKey: 'slot-a', itemKey: 'item-1', patch: { quantity: '200' } })
  state = act(state, {
    type: 'ADD_ITEM_SUBSTITUTION',
    variantKey: 'default',
    slotKey: 'slot-a',
    itemKey: 'item-1',
    key: 'sub-1',
    food: SUB_FOOD,
  })
  // El finde: sábado + domingo clonados del día base en una sola acción.
  state = act(state, { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sab', 'v-dom'], origin: 'copy-base' })
  // El domingo lleva objetivos propios; el sábado hereda.
  state = act(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-dom', mode: 'custom' })
  state = act(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-dom', field: 'calories', value: '2500' })
  return state
}

/** Mapa de porciones con la clave compuesta (idéntica en ambas superficies). */
function portionsMap(key: (variantKey: string, slotKey: string) => string): PortionsBySlot {
  return {
    [key('default', 'slot-a')]: [{ exchangeGroupId: GROUP_C, portions: 2 }],
    [key('v-sab', 'v-sab~slot-a')]: [{ exchangeGroupId: GROUP_C, portions: 1.5 }],
  }
}

describe('paridad de envelope web ↔ RN (multi-día + porciones + reemplazos)', () => {
  it('la clave de porciones se construye igual en las dos superficies', () => {
    expect(rnPortionsKey('v-sab', 'v-sab~slot-a')).toBe(webPortionsKey('v-sab', 'v-sab~slot-a'))
  })

  it('el MISMO estado produce el MISMO draft (finde clonado, 3 días)', () => {
    const rnState = buildScript(rnCreateEmpty, rnReducer, FOOD) as RnBuilderState
    const webState = buildScript(webCreateEmpty, webReducer, FOOD) as WebBuilderState

    // Los dos árboles son estructuralmente idénticos: mismo contrato de estado.
    expect(rnState).toEqual(webState)

    const rnDraft = NutritionPlanDraftSchema.parse(
      rnAssembleDraft(rnState, { clientId: CLIENT_ID, planId: PLAN_ID, portionsBySlot: portionsMap(rnPortionsKey) }),
    )
    const webDraft = attachPortionsAndValidate(
      webAssembleDraft(webState, { clientId: CLIENT_ID, planId: PLAN_ID }),
      variantPortionKeys(webState.variants),
      portionsMap(webPortionsKey),
    )

    expect(rnDraft).toEqual(webDraft)
    // Sanidad del escenario: 3 días, el finde con las porciones clonadas y el domingo con metas propias.
    expect(rnDraft.dayVariants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(rnDraft.dayVariants[1].mealSlots[0].exchangeTargets).toEqual([
      { exchangeGroupId: GROUP_C, portions: 1.5, notes: null, orderIndex: 0 },
    ])
    expect(rnDraft.dayVariants[2].targets.calories).toBe(2500)
    expect(rnDraft.dayVariants[0].mealSlots[0].items[0].substitutions).toHaveLength(1)
  })

  it('sin porciones el envelope tambien coincide (draft byte-idéntico al de un solo día)', () => {
    const rnState = rnCreateEmpty('2026-07-20')
    const webState = webCreateEmpty('2026-07-20')
    const rnDraft = NutritionPlanDraftSchema.parse(
      rnAssembleDraft({ ...rnState, planName: 'Flexible', strategy: 'flexible' }, { clientId: CLIENT_ID }),
    )
    const webDraft = NutritionPlanDraftSchema.parse(
      webAssembleDraft({ ...webState, planName: 'Flexible', strategy: 'flexible' }, { clientId: CLIENT_ID }),
    )
    expect(rnDraft).toEqual(webDraft)
    expect(rnDraft.dayVariants).toHaveLength(1)
  })
})
