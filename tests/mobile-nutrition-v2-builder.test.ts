import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import {
  BASE_VARIANT_KEY,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  activeVariantOf,
  assembleAndValidateDraft,
  assembleDraft,
  autoVariantLabel,
  baseVariantOf,
  buildItemInsertRow,
  buildPublishIdempotencyKey,
  buildSlotInsertRow,
  buildVariantInsertRow,
  builderHasSignificantContent,
  builderReducer,
  canProceedToPublishAfterArchive,
  clonedKey,
  computeItemMacros,
  createBaseVariant,
  createEmptyBuilderState,
  createEmptyItem,
  effectiveDateConflicts,
  itemMacros,
  mapFoodCatalogItemToBuilderFood,
  mapWriteError,
  migrateBuilderState,
  normalizeBuilderVariants,
  requiredNutritionProFeature,
  takenDayOfWeeks,
  validateStep,
  variantEffectiveTargets,
  variantTotals,
  type BuilderFood,
  type BuilderItem,
  type BuilderState,
  type BuilderVariant,
  type DraftPrescriptionItem,
} from '../apps/mobile/lib/nutrition-v2-builder'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'
const SUB_FOOD_ID = '55555555-5555-4555-8555-555555555555'

const FOOD: BuilderFood = {
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

function foodItem(overrides: Partial<BuilderItem> = {}): BuilderItem {
  return { ...createEmptyItem('i1'), food: FOOD, customName: null, quantity: '200', unit: 'g', ...overrides }
}

function subFood(id: string, name: string): BuilderFood {
  return { ...FOOD, id, name }
}

function structuredState(): BuilderState {
  return {
    step: 3,
    strategy: 'structured',
    planName: 'Plan estructurado',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    variants: [
      {
        ...createBaseVariant(),
        slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [foodItem()] }],
      },
    ],
    activeVariantKey: BASE_VARIANT_KEY,
  }
}

function hybridState(): BuilderState {
  return { ...structuredState(), strategy: 'hybrid' }
}

/** Franjas del dia base (el unico dia de los estados de arriba). */
function baseSlots(state: BuilderState) {
  return baseVariantOf(state).slots
}

describe('reducer / paridad con web', () => {
  it('SET_STRATEGY structured siembra una primera franja EN EL DIA BASE', () => {
    const next = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    expect(baseSlots(next)).toHaveLength(1)
    expect(next.permissions.canRegisterFreely).toBe(false)
  })

  it('ADD_ITEM con alimento precarga cantidad y unidad', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'slotK' })
    const slotKey = baseSlots(state)[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', variantKey: BASE_VARIANT_KEY, slotKey, key: 'itemK', food: FOOD })
    expect(baseSlots(state)[0].items[0].quantity).toBe('50')
    expect(baseSlots(state)[0].items[0].unit).toBe('g')
  })

  it('SET_PERMISSION conmuta un permiso; assembleDraft emite la eleccion del coach (sub-delta a)', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    // Default structured: registrar OFF, sustituir OFF.
    expect(state.permissions.canRegisterFreely).toBe(false)
    expect(state.permissions.canSubstitute).toBe(false)
    state = builderReducer(state, { type: 'SET_PERMISSION', field: 'canSubstitute', value: true })
    expect(state.permissions.canSubstitute).toBe(true)
    const draft = assembleDraft(state, { clientId: CLIENT_ID })
    expect(draft.permissions.canSubstitute).toBe(true)
    expect(draft.permissions.canRegisterFreely).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Multi-dia (FD4): espejo del reducer web. Invariantes duras — exactamente UNA
// variante default, `dayOfWeek` unico entre las especificas, tope de 7 dias.
// ---------------------------------------------------------------------------

describe('reducer multi-dia / ADD_VARIANTS', () => {
  it('crea N dias de una (multi-select) y deja activo el primero', () => {
    const state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6, 0], // sabado, domingo
      keys: ['v-sab', 'v-dom'],
      origin: 'empty',
    })
    expect(state.variants.map((v) => v.key)).toEqual([BASE_VARIANT_KEY, 'v-sab', 'v-dom'])
    expect(state.variants[1].label).toBe('Sábado')
    expect(state.variants[2].label).toBe('Domingo')
    expect(state.activeVariantKey).toBe('v-sab')
    // Dias nuevos vacios: el base conserva su franja.
    expect(state.variants[1].slots).toEqual([])
    expect(baseSlots(state)).toHaveLength(1)
  })

  it('origin copy-base CLONA las franjas/items/reemplazos con keys derivadas', () => {
    const withSub = builderReducer(structuredState(), {
      type: 'ADD_ITEM_SUBSTITUTION',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      itemKey: 'i1',
      key: 'sub-1',
      food: subFood(SUB_FOOD_ID, 'Pavo'),
    })
    const state = builderReducer(withSub, {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sab'],
      origin: 'copy-base',
    })
    const sabado = state.variants[1]
    expect(sabado.slots).toHaveLength(1)
    expect(sabado.slots[0].key).toBe(clonedKey('v-sab', 'slot-a'))
    expect(sabado.slots[0].items[0].key).toBe(clonedKey('v-sab', 'i1'))
    expect(sabado.slots[0].items[0].substitutions[0].key).toBe(clonedKey('v-sab', 'sub-1'))
    // El clon es independiente: editar el sabado no mueve el base.
    const edited = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: 'v-sab',
      slotKey: sabado.slots[0].key,
      itemKey: sabado.slots[0].items[0].key,
      patch: { quantity: '999' },
    })
    expect(baseSlots(edited)[0].items[0].quantity).toBe('200')
  })

  it('ignora dias repetidos / ya ocupados / invalidos (invariante day_of_week unico)', () => {
    const once = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    const twice = builderReducer(once, { type: 'ADD_VARIANTS', days: [6], keys: ['v-otro'], origin: 'empty' })
    expect(twice).toBe(once) // ninguna variante creada => mismo estado
    const dupInSameAction = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6, 6, 9],
      keys: ['a', 'b', 'c'],
      origin: 'empty',
    })
    expect(dupInSameAction.variants).toHaveLength(2)
  })

  it('respeta el tope de 7 dias especificos', () => {
    let state = structuredState()
    state = builderReducer(state, {
      type: 'ADD_VARIANTS',
      days: [1, 2, 3, 4, 5, 6, 0],
      keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      origin: 'empty',
    })
    expect(takenDayOfWeeks(state)).toHaveLength(MAX_DAY_VARIANTS)
    expect(state.variants).toHaveLength(MAX_DAY_VARIANTS + 1)
  })
})

describe('reducer multi-dia / invariantes de dia base', () => {
  it('REMOVE_VARIANT nunca elimina el dia base y reubica la key activa', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    expect(state.activeVariantKey).toBe('v-sab')
    expect(builderReducer(state, { type: 'REMOVE_VARIANT', variantKey: BASE_VARIANT_KEY })).toBe(state)
    state = builderReducer(state, { type: 'REMOVE_VARIANT', variantKey: 'v-sab' })
    expect(state.variants).toHaveLength(1)
    expect(state.activeVariantKey).toBe(BASE_VARIANT_KEY)
  })

  it('SET_VARIANT_DAY rechaza el base y los dias ocupados; la etiqueta AUTO sigue al dia', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sab', 'v-dom'], origin: 'empty' })
    expect(builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: BASE_VARIANT_KEY, dayOfWeek: 3 })).toBe(state)
    expect(builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sab', dayOfWeek: 0 })).toBe(state)
    state = builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sab', dayOfWeek: 3 })
    expect(state.variants[1].dayOfWeek).toBe(3)
    expect(state.variants[1].label).toBe(autoVariantLabel(3))
  })

  it('una etiqueta escrita por el coach NO la pisa el cambio de dia', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    state = builderReducer(state, { type: 'SET_VARIANT_LABEL', variantKey: 'v-sab', value: 'Día de partido' })
    state = builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sab', dayOfWeek: 3 })
    expect(state.variants[1].label).toBe('Día de partido')
  })

  it('DUPLICATE_VARIANT_AS clona contenido + personalizacion de metas del origen', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'copy-base' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sab', mode: 'custom' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-sab', field: 'calories', value: '2500' })
    state = builderReducer(state, { type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: 'v-sab', key: 'v-dom', dayOfWeek: 0 })
    const dom = state.variants.find((v) => v.key === 'v-dom') as BuilderVariant
    expect(dom.targetsMode).toBe('custom')
    expect(dom.targets.calories).toBe('2500')
    expect(dom.slots[0].items[0].quantity).toBe('200')
    expect(state.activeVariantKey).toBe('v-dom')
  })

  it('duplicar el dia BASE hereda (el base no tiene metas propias)', () => {
    const state = builderReducer(structuredState(), {
      type: 'DUPLICATE_VARIANT_AS',
      sourceVariantKey: BASE_VARIANT_KEY,
      key: 'v-sab',
      dayOfWeek: 6,
    })
    expect(state.variants[1].targetsMode).toBe('inherit')
    expect(state.variants[1].targets).toEqual({ calories: '', proteinG: '', carbsG: '', fatsG: '' })
  })
})

describe('reducer multi-dia / metas heredadas vs propias', () => {
  it('el dia base NUNCA personaliza metas', () => {
    const state = structuredState()
    expect(builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: BASE_VARIANT_KEY, mode: 'custom' })).toBe(state)
    expect(builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: BASE_VARIANT_KEY, field: 'calories', value: '1' })).toBe(state)
  })

  it('personalizar SIEMBRA con las metas del base (edicion incremental)', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sab', mode: 'custom' })
    expect(state.variants[1].targets).toEqual(state.targets)
  })

  it('variantEffectiveTargets: inherit => las del base; custom => las propias', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    expect(variantEffectiveTargets(state, state.variants[1])).toEqual(state.targets)
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sab', mode: 'custom' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-sab', field: 'calories', value: '2500' })
    expect(variantEffectiveTargets(state, state.variants[1]).calories).toBe('2500')
    // El base sigue con las suyas.
    expect(variantEffectiveTargets(state, baseVariantOf(state)).calories).toBe('2000')
  })
})

describe('reducer multi-dia / dia activo', () => {
  it('SET_ACTIVE_VARIANT ignora keys inexistentes; activeVariantOf cae al base si queda huerfana', () => {
    const state = structuredState()
    expect(builderReducer(state, { type: 'SET_ACTIVE_VARIANT', variantKey: 'no-existe' })).toBe(state)
    expect(activeVariantOf({ ...state, activeVariantKey: 'fantasma' }).key).toBe(BASE_VARIANT_KEY)
  })
})

describe('normalizeBuilderVariants (invariantes al rehidratar)', () => {
  it('deja exactamente UNA default (primera marcada), sin dayOfWeek y primera en el arreglo', () => {
    const out = normalizeBuilderVariants([
      { key: 'a', label: 'Sábado', dayOfWeek: 6, isDefault: false, targetsMode: 'inherit', targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' }, slots: [] },
      { key: 'b', label: 'Base', dayOfWeek: 3, isDefault: true, targetsMode: 'custom', targets: { calories: '9', proteinG: '', carbsG: '', fatsG: '' }, slots: [] },
    ])
    expect(out[0].key).toBe('b')
    expect(out[0].isDefault).toBe(true)
    expect(out[0].dayOfWeek).toBeNull()
    expect(out[0].targetsMode).toBe('inherit')
    expect(out.filter((v) => v.isDefault)).toHaveLength(1)
  })

  it('descarta especificas con dayOfWeek repetido o invalido y keys duplicadas', () => {
    const base = createBaseVariant()
    const dup = (key: string, dayOfWeek: number | null): BuilderVariant => ({
      key,
      label: 'x',
      dayOfWeek,
      isDefault: false,
      targetsMode: 'inherit',
      targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
      slots: [],
    })
    const out = normalizeBuilderVariants([base, dup('a', 6), dup('b', 6), dup('c', null), dup('a', 2)])
    expect(out.map((v) => v.key)).toEqual([base.key, 'a'])
  })

  it('un arreglo vacio produce un dia base valido', () => {
    expect(normalizeBuilderVariants([])).toEqual([createBaseVariant()])
  })
})

describe('migrateBuilderState (borrador v1 `slots` -> v2 `variants`)', () => {
  it('migra el formato VIEJO: las franjas planas se vuelven el dia base', () => {
    const legacy = {
      step: 2,
      strategy: 'structured',
      planName: 'Plan viejo',
      effectiveFrom: '2026-07-01',
      targets: { calories: '1800', proteinG: '', carbsG: '', fatsG: '' },
      permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
      slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [] }],
    }
    const migrated = migrateBuilderState(legacy, '2026-07-20') as BuilderState
    expect(migrated.variants).toHaveLength(1)
    expect(migrated.variants[0].isDefault).toBe(true)
    expect(migrated.variants[0].slots).toHaveLength(1)
    expect(migrated.activeVariantKey).toBe(BASE_VARIANT_KEY)
    expect(migrated.planName).toBe('Plan viejo')
    expect(migrated.effectiveFrom).toBe('2026-07-01')
  })

  it('acepta el formato NUEVO y re-clampa el step + repara la key activa huerfana', () => {
    const raw = { ...structuredState(), step: 99, activeVariantKey: 'fantasma' }
    const migrated = migrateBuilderState(raw, '2026-07-20') as BuilderState
    expect(migrated.step).toBe(3)
    expect(migrated.activeVariantKey).toBe(BASE_VARIANT_KEY)
  })

  it('un payload que no es del wizard (sin slots ni variants) => null', () => {
    expect(migrateBuilderState({ foo: 'bar' }, '2026-07-20')).toBeNull()
    expect(migrateBuilderState(null, '2026-07-20')).toBeNull()
    expect(migrateBuilderState('texto', '2026-07-20')).toBeNull()
  })

  it('effectiveFrom ausente cae al fallback del wizard', () => {
    const migrated = migrateBuilderState({ slots: [] }, '2026-07-20') as BuilderState
    expect(migrated.effectiveFrom).toBe('2026-07-20')
  })
})

describe('reducer / reemplazos autorizados F-02 (cinturon triple + remocion)', () => {
  const SLOT = 'slot-a'
  const ITEM = 'i1'

  function addSub(state: BuilderState, food: BuilderFood, key: string): BuilderState {
    return builderReducer(state, {
      type: 'ADD_ITEM_SUBSTITUTION',
      variantKey: BASE_VARIANT_KEY,
      slotKey: SLOT,
      itemKey: ITEM,
      key,
      food,
    })
  }

  it('agrega reemplazos del catalogo hasta el tope y rechaza el excedente', () => {
    let state = structuredState()
    for (let i = 0; i < MAX_ITEM_SUBSTITUTIONS; i++) {
      state = addSub(state, subFood('sub-' + i, 'Sub ' + i), 'k' + i)
    }
    expect(baseSlots(state)[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
    const overflow = addSub(state, subFood('sub-extra', 'Extra'), 'kX')
    expect(baseSlots(overflow)[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
  })

  it('rechaza duplicar el mismo alimento como reemplazo (por food.id)', () => {
    let state = addSub(structuredState(), subFood('sub-x', 'X'), 'k1')
    state = addSub(state, subFood('sub-x', 'X otra vez'), 'k2')
    expect(baseSlots(state)[0].items[0].substitutions).toHaveLength(1)
  })

  it('rechaza el propio alimento prescrito como reemplazo', () => {
    const state = addSub(structuredState(), subFood(FOOD_ID, 'Prescrito'), 'k1')
    expect(baseSlots(state)[0].items[0].substitutions).toHaveLength(0)
  })

  it('remueve un reemplazo por subKey', () => {
    let state = addSub(structuredState(), subFood('sub-a', 'A'), 'k1')
    state = addSub(state, subFood('sub-b', 'B'), 'k2')
    state = builderReducer(state, {
      type: 'REMOVE_ITEM_SUBSTITUTION',
      variantKey: BASE_VARIANT_KEY,
      slotKey: SLOT,
      itemKey: ITEM,
      subKey: 'k1',
    })
    expect(baseSlots(state)[0].items[0].substitutions.map((s) => s.key)).toEqual(['k2'])
  })
})

describe('assembleDraft / reemplazos F-02 (spread condicional)', () => {
  it('omite la clave substitutions cuando no hay reemplazos (byte-identico a hoy)', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID })
    expect('substitutions' in draft.dayVariants[0].mealSlots[0].items[0]).toBe(false)
  })

  it('emite substitutions mapeada al contrato solo con >=1 y valida contra el schema', () => {
    const withSub = builderReducer(structuredState(), {
      type: 'ADD_ITEM_SUBSTITUTION',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      itemKey: 'i1',
      key: 'k1',
      food: subFood(SUB_FOOD_ID, 'Pavo'),
    })
    const subs = assembleDraft(withSub, { clientId: CLIENT_ID }).dayVariants[0].mealSlots[0].items[0].substitutions
    expect(subs).toHaveLength(1)
    expect(subs?.[0]).toEqual({
      foodId: SUB_FOOD_ID,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    })
    expect(() => assembleAndValidateDraft(withSub, { clientId: CLIENT_ID })).not.toThrow()
  })
})

describe('assembleDraft multi-dia', () => {
  it('emite UNA variante por dia, en orden, con dayOfWeek/default correctos', () => {
    const state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6, 0],
      keys: ['v-sab', 'v-dom'],
      origin: 'copy-base',
    })
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    expect(draft.dayVariants.map((v) => v.key)).toEqual([BASE_VARIANT_KEY, 'v-sab', 'v-dom'])
    expect(draft.dayVariants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(draft.dayVariants.map((v) => v.default)).toEqual([true, false, false])
    expect(draft.dayVariants.map((v) => v.orderIndex)).toEqual([0, 1, 2])
    // Las franjas se re-numeran DENTRO de cada dia.
    expect(draft.dayVariants[1].mealSlots[0].code).toBe('slot-1')
  })

  it('las variantes `inherit` CONGELAN las metas del dia base en el draft', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sab', 'v-dom'], origin: 'copy-base' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-dom', mode: 'custom' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-dom', field: 'calories', value: '2500' })
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    expect(draft.dayVariants[1].targets.calories).toBe(2000) // sabado hereda
    expect(draft.dayVariants[2].targets.calories).toBe(2500) // domingo propio
  })

  it('un plan de UN dia produce el draft de siempre (variante `default`)', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants).toHaveLength(1)
    expect(draft.dayVariants[0].key).toBe('default')
    expect(draft.dayVariants[0].label).toBe('Todos los días')
    expect(draft.dayVariants[0].default).toBe(true)
  })

  it('gate Pro: >1 dia exige multi_variant (contrato compartido)', () => {
    const multi = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'copy-base' })
    expect(requiredNutritionProFeature(assembleDraft(multi, { clientId: CLIENT_ID }))).toBe('multi_variant')
  })
})

describe('validateStep multi-dia', () => {
  it('un dia SIN franjas bloquea el paso aunque no sea el activo, nombrandolo', () => {
    const state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'empty' })
    // El sabado quedo vacio y ademas es el activo tras crearlo.
    const withBaseActive = { ...state, activeVariantKey: BASE_VARIANT_KEY }
    const result = validateStep(withBaseActive, 2)
    expect(result.ok).toBe(false)
    expect(result.errors['variant.v-sab.slots']).toContain('Sábado')
    expect(result.errors.slots).toContain('Sábado')
  })

  it('un item incompleto de un dia NO activo tambien bloquea', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'copy-base' })
    const sabSlot = state.variants[1].slots[0]
    state = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: 'v-sab',
      slotKey: sabSlot.key,
      itemKey: sabSlot.items[0].key,
      patch: { quantity: '' },
    })
    const result = validateStep({ ...state, activeVariantKey: BASE_VARIANT_KEY }, 2)
    expect(result.ok).toBe(false)
    expect(result.errors['item.' + sabSlot.items[0].key + '.quantity']).toBe('Cantidad invalida.')
  })
})

describe('variantTotals', () => {
  it('suma los items fijos de UN dia (no del plan entero)', () => {
    const state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sab'], origin: 'copy-base' })
    // 200 g de FOOD = 200 kcal por dia; el clon del sabado suma lo MISMO, no el doble.
    expect(variantTotals(baseVariantOf(state)).calories).toBe(200)
    expect(variantTotals(state.variants[1]).calories).toBe(200)
  })
})

describe('computeItemMacros', () => {
  it('reutiliza el motor compartido (paridad con el alumno)', () => {
    const macros = computeItemMacros(FOOD, 200, 'g')
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.fiberG).toBe(4)
  })
})

describe('assemble + validate', () => {
  it('structured: franjas + items prescritos, valido contra el contrato', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots[0].code).toBe('slot-1')
    expect(draft.dayVariants[0].mealSlots[0].items[0].foodId).toBe(FOOD_ID)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('propaga planId como nueva version', () => {
    expect(assembleDraft(structuredState(), { clientId: CLIENT_ID, planId: PLAN_ID }).planId).toBe(PLAN_ID)
  })

  it('paso 0 exige estrategia; paso 2 rechaza franja sin nombre', () => {
    expect(validateStep(createEmptyBuilderState('2026-07-20'), 0).ok).toBe(false)
    const bad = structuredState()
    bad.variants[0].slots[0].name = ''
    expect(validateStep(bad, 2).ok).toBe(false)
  })
})

describe('catalogo -> BuilderFood', () => {
  it('mapea macros por 100 preservando serving', () => {
    const item = {
      id: FOOD_ID, catalogKey: null, gtin: null, name: 'Avena', brand: 'Marca', category: null, countryCode: 'CL',
      servingSize: 100, servingUnit: 'g', calories: 380, proteinG: 13, carbsG: 67, fatsG: 7, fiberG: 10,
      sodiumMg: null, sugarG: null, saturatedFatG: null, packageQuantity: null, packageUnit: null,
      source: 'off', sourceRef: null, verificationStatus: 'verified' as const, media: null,
    }
    const food = mapFoodCatalogItemToBuilderFood(item)
    expect(food.id).toBe(FOOD_ID)
    expect(food.servingSize).toBe(100)
    expect(itemMacros({ ...createEmptyItem('x'), food, quantity: '200', unit: 'g' }).calories).toBe(760)
  })
})

describe('gate Pro (contrato compartido)', () => {
  it('hybrid dispara hybrid_strategy; structured base = null', () => {
    expect(requiredNutritionProFeature(assembleDraft(hybridState(), { clientId: CLIENT_ID }))).toBe('hybrid_strategy')
    expect(requiredNutritionProFeature(assembleDraft(structuredState(), { clientId: CLIENT_ID }))).toBeNull()
  })
})

describe('insert row builders', () => {
  const item: DraftPrescriptionItem = {
    foodId: FOOD_ID, recipeId: null, customName: null, quantity: 200, unit: 'g',
    minimumQuantity: null, maximumQuantity: null, optional: false, substitutionGroupId: null, notes: null, orderIndex: 0,
  }
  it('buildItemInsertRow re-deriva snapshot desde el alimento', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item, food: FOOD })
    expect(row.snapshot_name).toBe('Pollo')
    expect(row.snapshot_calories).toBe(200)
    expect(row.snapshot_fiber_g).toBe(4)
  })
  it('variant + slot mapean columnas de BD', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(buildVariantInsertRow('v1', draft.dayVariants[0]).is_default).toBe(true)
    expect(buildSlotInsertRow('v1', 'var1', draft.dayVariants[0].mealSlots[0]).slot_code).toBe('slot-1')
  })
})

describe('mapWriteError', () => {
  it('42501 => SCOPE_DENIED', () => {
    expect(mapWriteError({ message: 'denied', code: '42501' }, 'plan').code).toBe('SCOPE_DENIED')
  })
})

describe('buildPublishIdempotencyKey', () => {
  it('estable por operationId, incluye rn-builder', () => {
    const a = buildPublishIdempotencyKey({ clientId: CLIENT_ID, operationId: 'op-1' })
    const b = buildPublishIdempotencyKey({ clientId: CLIENT_ID, operationId: 'op-1' })
    expect(a).toBe(b)
    expect(a).toContain('rn-builder')
    expect(a).toContain('publish')
  })
})

// NUT-005: el orden de escritura (plan->version->variantes->franjas->items->publish) ya NO corre
// en el dispositivo, y desde esta ola tampoco el alta de alimento coach-scoped: la publicacion y
// el `createFood` del coach pasan por POST /api/mobile/nutrition-v2/coach/mutate, que reusa el
// codigo de escritura de la web (cubierto por plan-persistence.*.test.ts y por el route.test.ts
// del endpoint). Lo que RN debe garantizar (llamar al endpoint y NUNCA escribir directo) vive en
// tests/mobile-nutrition-v2-coach-mutations.test.ts.

describe('effectiveDateConflicts (sub-delta c)', () => {
  it('igual o anterior choca; posterior no; faltante no bloquea', () => {
    expect(effectiveDateConflicts('2026-07-20', '2026-07-20')).toBe(true)
    expect(effectiveDateConflicts('2026-07-19', '2026-07-20')).toBe(true)
    expect(effectiveDateConflicts('2026-07-21', '2026-07-20')).toBe(false)
    expect(effectiveDateConflicts(null, '2026-07-20')).toBe(false)
    expect(effectiveDateConflicts('2026-07-20', null)).toBe(false)
    expect(effectiveDateConflicts(undefined, undefined)).toBe(false)
  })
})

describe('canProceedToPublishAfterArchive (sub-delta c)', () => {
  it('OK y PLAN_NOT_FOUND avanzan; otros fallos bloquean', () => {
    // Forma RN del ArchiveWriteOutcome (code: 'OK') + PLAN_NOT_FOUND idempotente.
    expect(canProceedToPublishAfterArchive({ code: 'OK' })).toBe(true)
    expect(canProceedToPublishAfterArchive({ code: 'PLAN_NOT_FOUND' })).toBe(true)
    // Forma web (ok: true) por robustez.
    expect(canProceedToPublishAfterArchive({ ok: true })).toBe(true)
    expect(canProceedToPublishAfterArchive({ code: 'SCOPE_DENIED' })).toBe(false)
    expect(canProceedToPublishAfterArchive({ code: 'WRITE_FAILED' })).toBe(false)
  })
})

describe('reducer / RESTORE (respaldo local del builder, 4B-13)', () => {
  it('un payload valido reemplaza el arbol completo y re-clampa el step', () => {
    // Estado inicial distinto (vacio) para probar que RESTORE reemplaza TODO, no fusiona.
    const restored = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'RESTORE',
      state: structuredState(),
    })
    expect(restored.strategy).toBe('structured')
    expect(restored.planName).toBe('Plan estructurado')
    expect(baseSlots(restored)).toHaveLength(1)
    expect(baseSlots(restored)[0].items[0].food?.id).toBe(FOOD_ID)
    expect(restored.step).toBe(3)
  })

  it('round-trip por AsyncStorage (JSON) del payload { state, portionsBySlot }: arbol Y porciones intactos', () => {
    // Simula el sobre persistido por writeNutritionDraft: el payload viaja como JSON y vuelve.
    const portionsBySlot = { 'default::slot-a': [{ exchangeGroupId: 'grp-1', portions: 2 }] }
    const payload = { clientId: CLIENT_ID, planId: PLAN_ID, state: structuredState(), portionsBySlot }
    const roundTripped = JSON.parse(JSON.stringify(payload)) as typeof payload
    // El reducer rehidrata el arbol...
    const restored = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'RESTORE', state: roundTripped.state })
    expect(restored).toEqual(structuredState())
    // ...y el mapa hermano de porciones (que restoreBySlot mete via setBySlot) sobrevive identico.
    expect(roundTripped.portionsBySlot).toEqual(portionsBySlot)
  })

  it('un borrador VIEJO (formato plano `slots`) se migra al dia base en vez de perderse', () => {
    const restored = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'RESTORE',
      state: {
        step: 2,
        strategy: 'structured',
        planName: 'Plan viejo',
        effectiveFrom: '2026-07-01',
        targets: { calories: '1800', proteinG: '', carbsG: '', fatsG: '' },
        permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
        slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [] }],
      },
    })
    expect(restored.variants).toHaveLength(1)
    expect(baseSlots(restored)).toHaveLength(1)
    expect(restored.planName).toBe('Plan viejo')
  })

  it('un payload sin `slots` ni `variants` (corrupto) se ignora: devuelve el state intacto', () => {
    const current = structuredState()
    const restored = builderReducer(current, { type: 'RESTORE', state: { foo: 'bar' } })
    expect(restored).toBe(current)
  })

  it('step no finito en el payload => 0', () => {
    const restored = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'RESTORE',
      state: { ...structuredState(), step: Number.NaN },
    })
    expect(restored.step).toBe(0)
  })

  it('step fuera de rango en el payload => re-clampado al maximo (3)', () => {
    const restored = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'RESTORE',
      state: { ...structuredState(), step: 99 },
    })
    expect(restored.step).toBe(3)
  })
})

describe('builderHasSignificantContent (guard de autosave + salida, 4B-13)', () => {
  it('un wizard recien abierto (vacio) => false', () => {
    expect(builderHasSignificantContent(createEmptyBuilderState('2026-07-20'))).toBe(false)
  })

  it('con estrategia elegida => true', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), strategy: 'flexible' as const }
    expect(builderHasSignificantContent(state)).toBe(true)
  })

  it('con nombre de plan (aunque sea solo espacios significativos) => true', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), planName: 'Mi plan' }
    expect(builderHasSignificantContent(state)).toBe(true)
  })

  it('nombre de plan solo con espacios en blanco => false', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), planName: '   ' }
    expect(builderHasSignificantContent(state)).toBe(false)
  })

  it('con al menos una franja en CUALQUIER dia => true', () => {
    const empty = createEmptyBuilderState('2026-07-20')
    const state = {
      ...empty,
      variants: [{ ...empty.variants[0], slots: [{ key: 's1', name: '', startTime: '', items: [] }] }],
    }
    expect(builderHasSignificantContent(state)).toBe(true)
  })

  it('con un dia especifico creado (aunque vacio) => true', () => {
    const state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sab'],
      origin: 'empty',
    })
    expect(builderHasSignificantContent(state)).toBe(true)
  })

  it('con al menos una meta con valor => true', () => {
    const state = {
      ...createEmptyBuilderState('2026-07-20'),
      targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' },
    }
    expect(builderHasSignificantContent(state)).toBe(true)
  })
})
