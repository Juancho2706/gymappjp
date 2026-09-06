import { describe, it, expect } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import { calculateFoodItemMacros } from '@eva/nutrition-engine'
import {
  BASE_VARIANT_KEY,
  BUILDER_STEP_COUNT,
  BUILDER_STEP_DAYS,
  BUILDER_STEP_PLAN,
  CoachFoodInputSchema,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  VISIBLE_NOTES_MAX,
  assembleDraft,
  assembleAndValidateDraft,
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  builderDayCells,
  builderDowForVariant,
  builderReducer,
  builderVariantForDayOfWeek,
  clonedKey,
  computeCustomItemMacros,
  computeItemMacros,
  createBaseVariant,
  createEmptyBuilderState,
  createEmptyItem,
  customMacrosOf,
  defaultPermissionsFor,
  inheritedDayOfWeeks,
  initialBuilderDow,
  itemMacros,
  macroEnergyMismatch,
  migrateBuilderState,
  nextPermissionsForStrategyChange,
  normalizeBuilderVariants,
  resolveSlotCopyTargets,
  slotMergeName,
  slotsLostIfFlexible,
  validateStep,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
  type BuilderVariant,
  type DraftPrescriptionItem,
} from './draft-builder'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'

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
  return {
    ...createEmptyItem('i1'),
    food: FOOD,
    customName: null,
    quantity: '200',
    unit: 'g',
    ...overrides,
  }
}

function customItem(overrides: Partial<BuilderItem> = {}): BuilderItem {
  return {
    ...createEmptyItem('c1'),
    food: null,
    customName: 'Colacion casera',
    quantity: '200',
    unit: 'g',
    customCalories: '100',
    customProteinG: '10',
    customCarbsG: '20',
    customFatsG: '5',
    ...overrides,
  }
}

/** Dia especifico de prueba (multi-dia). */
function dayVariant(over: Partial<BuilderVariant> & { key: string; dayOfWeek: number }): BuilderVariant {
  return {
    label: 'Dia',
    isDefault: false,
    targetsMode: 'inherit',
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    slots: [],
    ...over,
  }
}

function flexibleState(): BuilderState {
  return {
    step: BUILDER_STEP_DAYS,
    strategy: 'flexible',
    planName: 'Plan de corte',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' },
    permissions: { canRegisterFreely: true, canAdjustPrescribedQuantity: true, canSubstitute: true },
    visibleNotes: null,
    variants: [createBaseVariant()],
    activeVariantKey: BASE_VARIANT_KEY,
  }
}

function baseSlot(): BuilderSlot {
  return { key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [foodItem()] }
}

function structuredState(): BuilderState {
  return {
    step: BUILDER_STEP_DAYS,
    strategy: 'structured',
    planName: 'Plan estructurado',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    visibleNotes: null,
    variants: [{ ...createBaseVariant(), slots: [baseSlot()] }],
    activeVariantKey: BASE_VARIANT_KEY,
  }
}

/** Estado v1 (pre multi-dia) tal cual quedaba en localStorage: `slots` planas. */
function legacyStatePayload(): Record<string, unknown> {
  return {
    step: 2,
    strategy: 'structured',
    planName: 'Plan viejo',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2100', proteinG: '160', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    slots: [baseSlot()],
  }
}

describe('computeItemMacros', () => {
  it('reutiliza el motor compartido (paridad con el alumno) para gramos', () => {
    const engine = calculateFoodItemMacros({
      quantity: 200,
      unit: 'g',
      foods: { name: FOOD.name, calories: 100, protein_g: 10, carbs_g: 20, fats_g: 5, serving_size: 50, serving_unit: 'g' },
    })
    const macros = computeItemMacros(FOOD, 200, 'g')
    expect(macros.calories).toBe(engine.calories)
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.fiberG).toBe(4)
  })

  it('usa serving_size para unidades count', () => {
    const macros = computeItemMacros(FOOD, 2, 'un')
    expect(macros.calories).toBe(100)
    expect(macros.proteinG).toBe(10)
  })

  it('devuelve cero para cantidades no positivas', () => {
    expect(computeItemMacros(FOOD, 0, 'g').calories).toBe(0)
  })
})

describe('alimento libre con macros', () => {
  it('computeCustomItemMacros escala las macros por 100 por la cantidad', () => {
    const macros = computeCustomItemMacros(customItem(), 200)
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.carbsG).toBe(40)
    expect(macros.fatsG).toBe(10)
  })

  it('itemMacros refleja las macros del item libre (preview del dia)', () => {
    const macros = itemMacros(customItem({ quantity: '150' }))
    expect(macros.calories).toBe(150)
    expect(macros.proteinG).toBe(15)
  })

  it('item libre sin macros aporta cero (no rompe el preview)', () => {
    const macros = itemMacros(customItem({ customCalories: '', customProteinG: '', customCarbsG: '', customFatsG: '' }))
    expect(macros.calories).toBe(0)
    expect(macros.proteinG).toBe(0)
  })

  it('customMacrosOf coacciona vacios/negativos a cero', () => {
    const m = customMacrosOf(customItem({ customCalories: '', customProteinG: '-5' }))
    expect(m.calories).toBe(0)
    expect(m.proteinG).toBe(0)
    expect(m.carbsG).toBe(20)
  })
})

describe('CoachFoodInputSchema', () => {
  const valid = {
    clientId: CLIENT_ID,
    name: 'Colacion casera',
    unit: 'g' as const,
    calories: 180,
    proteinG: 10,
    carbsG: 20,
    fatsG: 5,
  }

  it('acepta macros no-negativas y aplica default de brand', () => {
    const parsed = CoachFoodInputSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.brand).toBeNull()
  })

  it('rechaza macros negativas', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, proteinG: -1 }).success).toBe(false)
    expect(CoachFoodInputSchema.safeParse({ ...valid, calories: -10 }).success).toBe(false)
  })

  it('rechaza nombre vacio', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })

  it('rechaza unidad fuera de g/ml', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, unit: 'un' }).success).toBe(false)
  })
})

describe('macroEnergyMismatch', () => {
  it('sin warning cuando las kcal cuadran con Atwater', () => {
    expect(macroEnergyMismatch({ calories: 165, proteinG: 10, carbsG: 20, fatsG: 5 })).toBe(false)
  })

  it('warning cuando las kcal se alejan mas de 40%', () => {
    expect(macroEnergyMismatch({ calories: 400, proteinG: 10, carbsG: 20, fatsG: 5 })).toBe(true)
  })

  it('todo en cero no dispara warning', () => {
    expect(macroEnergyMismatch({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 })).toBe(false)
  })
})

describe('assembleDraft', () => {
  it('flexible: una variante por defecto, sin franjas, valida contra el contrato', () => {
    const draft = assembleDraft(flexibleState(), { clientId: CLIENT_ID })
    expect(draft.strategy).toBe('flexible')
    expect(draft.dayVariants).toHaveLength(1)
    expect(draft.dayVariants[0].default).toBe(true)
    expect(draft.dayVariants[0].mealSlots).toHaveLength(0)
    expect(draft.dayVariants[0].targets.calories).toBe(2000)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('structured: franjas + items prescritos, valida contra el contrato', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots).toHaveLength(1)
    const slot = draft.dayVariants[0].mealSlots[0]
    expect(slot.code).toBe('slot-1')
    expect(slot.name).toBe('Desayuno')
    expect(slot.startTime).toBe('08:00')
    expect(slot.items[0].foodId).toBe(FOOD_ID)
    expect(slot.items[0].quantity).toBe(200)
    expect(slot.items[0].unit).toBe('g')
  })

  it('item libre (sin food) va al payload como customName + cantidad', () => {
    const state = structuredState()
    state.variants[0].slots[0].items = [customItem()]
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    const item = draft.dayVariants[0].mealSlots[0].items[0]
    expect(item.foodId).toBeNull()
    expect(item.customName).toBe('Colacion casera')
    expect(item.quantity).toBe(200)
    expect(item.unit).toBe('g')
  })

  it('propaga planId cuando es una nueva version', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.planId).toBe(PLAN_ID)
  })

  it('assembleAndValidateDraft lanza con item de cantidad invalida', () => {
    const bad = structuredState()
    bad.variants[0].slots[0].items[0].quantity = '0'
    expect(() => assembleAndValidateDraft(bad, { clientId: CLIENT_ID })).toThrow()
  })

  // F-02: los reemplazos autorizados del builder (solo catalogo) viajan al draft como
  // foodId + quantity/unit null ("misma porcion"), con orderIndex por posicion. El server
  // congela el snapshot al persistir. Un item sin reemplazos queda byte-identico a hoy.
  it('mapea los reemplazos autorizados del item al draft (foodId + quantity/unit null + orderIndex)', () => {
    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo molido' }
    const subB: BuilderFood = { ...FOOD, id: '55555555-5555-4555-8555-555555555555', name: 'Merluza' }
    const state = structuredState()
    state.variants[0].slots[0].items = [
      foodItem({ substitutions: [{ key: 's1', food: subA }, { key: 's2', food: subB }] }),
    ]
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    const item = draft.dayVariants[0].mealSlots[0].items[0]
    expect(item.substitutions).toHaveLength(2)
    expect(item.substitutions?.[0]).toMatchObject({
      foodId: subA.id,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    })
    expect(item.substitutions?.[1]).toMatchObject({ foodId: subB.id, orderIndex: 1 })
  })

  it('item sin reemplazos NO agrega la clave substitutions (capa opcional, byte-identico)', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots[0].items[0]).not.toHaveProperty('substitutions')
  })

  // Perdida de datos (P0): publicar reescribe la version COMPLETA y las notas visibles se
  // escriben en la edicion rapida, no en el wizard. Emitirlas de vuelta es lo unico que evita
  // que "Rehacer con el asistente" las borre en silencio.
  it('emite las notas visibles del estado (carry-over del plan vigente), ya trimeadas', () => {
    const state = { ...structuredState(), visibleNotes: '  Domingo comida libre, hidratate  ' }
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    expect(draft.visibleNotes).toBe('Domingo comida libre, hidratate')
  })

  it('notas visibles vacias o ausentes => null (paridad con la edicion rapida)', () => {
    const blank = assembleDraft({ ...structuredState(), visibleNotes: '   ' }, { clientId: CLIENT_ID })
    expect(blank.visibleNotes).toBeNull()
    expect(assembleDraft(structuredState(), { clientId: CLIENT_ID }).visibleNotes).toBeNull()
  })

  it('el protocolo profesional NO viaja del cliente (lo repone publishPlanAction)', () => {
    const state = { ...structuredState(), visibleNotes: 'Hidratate' }
    expect(assembleDraft(state, { clientId: CLIENT_ID }).protocolNotes).toBeNull()
    expect(assembleDraft(state, { clientId: CLIENT_ID }).privateNotes).toBeNull()
  })

  // T2.6 F5: el wizard EDITA las notas (antes solo las arrastraba). Regresion de la deuda del
  // PR #174: "Rehacer con el asistente" + editar + publicar tiene que emitir LO EDITADO, y el
  // vaciado deliberado tiene que llegar como null (no revivir las notas del plan vigente).
  it('SET_VISIBLE_NOTES edita las notas rehidratadas y assembleDraft emite lo editado', () => {
    const rehydrated = { ...structuredState(), visibleNotes: 'Notas del plan vigente' }
    const edited = builderReducer(rehydrated, { type: 'SET_VISIBLE_NOTES', value: '  Nuevas indicaciones  ' })
    expect(edited.visibleNotes).toBe('  Nuevas indicaciones  ')
    expect(assembleDraft(edited, { clientId: CLIENT_ID }).visibleNotes).toBe('Nuevas indicaciones')
  })

  it('vaciar las notas desde el wizard publica null (borrado deliberado, no carry-over)', () => {
    const rehydrated = { ...structuredState(), visibleNotes: 'Notas del plan vigente' }
    const cleared = builderReducer(rehydrated, { type: 'SET_VISIBLE_NOTES', value: '' })
    // La clave queda PRESENTE (el borrador "sabe" de notas): un RESTORE posterior no las revive.
    expect(cleared.visibleNotes).toBe('')
    expect(assembleDraft(cleared, { clientId: CLIENT_ID }).visibleNotes).toBeNull()
  })
})

// Wizard de DOS pasos (SPEC nutrition-ui-poda, punto 11): paso 0 "El plan" (estrategia + nombre +
// metas, antes repartidos en dos pasos) y paso 1 "Los dias" (lo que era el paso "Construccion").
describe('validateStep', () => {
  it('el wizard tiene exactamente dos pasos', () => {
    expect(BUILDER_STEP_COUNT).toBe(2)
    expect(BUILDER_STEP_PLAN).toBe(0)
    expect(BUILDER_STEP_DAYS).toBe(1)
  })

  it('paso "El plan" exige estrategia, nombre y al menos una meta EN EL MISMO paso', () => {
    const state = createEmptyBuilderState('2026-07-20')
    const empty = validateStep(state, BUILDER_STEP_PLAN)
    expect(empty.ok).toBe(false)
    expect(empty.errors.strategy).toBeTruthy()
    expect(empty.errors.planName).toBeTruthy()

    // Con estrategia pero sin nombre ni metas sigue bloqueado (antes eso pasaba el paso 0).
    const onlyStrategy = { ...state, strategy: 'flexible' as const }
    const partial = validateStep(onlyStrategy, BUILDER_STEP_PLAN)
    expect(partial.ok).toBe(false)
    expect(partial.errors.strategy).toBeUndefined()
    expect(partial.errors.planName).toBeTruthy()
    expect(partial.errors.calories).toBeTruthy()

    const complete = {
      ...onlyStrategy,
      planName: 'X',
      targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' },
    }
    expect(validateStep(complete, BUILDER_STEP_PLAN).ok).toBe(true)
  })

  it('paso "El plan" corta las notas visibles sobre el tope del contrato (espejo del quick-edit)', () => {
    const base = {
      ...createEmptyBuilderState('2026-07-20'),
      strategy: 'flexible' as const,
      planName: 'X',
      targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' },
    }
    const over = { ...base, visibleNotes: 'a'.repeat(VISIBLE_NOTES_MAX + 1) }
    expect(validateStep(over, BUILDER_STEP_PLAN).errors.visibleNotes).toBeTruthy()
    const atLimit = { ...base, visibleNotes: 'a'.repeat(VISIBLE_NOTES_MAX) }
    expect(validateStep(atLimit, BUILDER_STEP_PLAN).ok).toBe(true)
  })

  it('paso "El plan" rechaza kcal no numerico', () => {
    const state = {
      ...createEmptyBuilderState('2026-07-20'),
      strategy: 'flexible' as const,
      planName: 'X',
      targets: { calories: 'abc', proteinG: '', carbsG: '', fatsG: '' },
    }
    expect(validateStep(state, BUILDER_STEP_PLAN).errors.calories).toBeTruthy()
  })

  it('paso "Los dias" (structured) rechaza franja sin nombre y acepta valida', () => {
    const bad = structuredState()
    bad.variants[0].slots[0].name = ''
    expect(validateStep(bad, BUILDER_STEP_DAYS).ok).toBe(false)
    expect(validateStep(structuredState(), BUILDER_STEP_DAYS).ok).toBe(true)
  })

  it('paso "Los dias" acepta un item libre con nombre y cantidad', () => {
    const state = structuredState()
    state.variants[0].slots[0].items = [customItem()]
    expect(validateStep(state, BUILDER_STEP_DAYS).ok).toBe(true)
  })

  it('paso "Los dias" no valida franjas en un plan flexible', () => {
    expect(validateStep(flexibleState(), BUILDER_STEP_DAYS).ok).toBe(true)
  })
})

// Selector "tocas el dia, no la variante" (SPEC nutrition-ui-poda, punto 10). El MODELO de
// variantes no cambia: estos helpers solo traducen dia <-> variante con la regla del snapshot.
describe('selector de dia del creador', () => {
  function multiDay(): BuilderState {
    const base = { ...createBaseVariant(), slots: [baseSlot()] }
    const sabado = dayVariant({ key: 'v-sa', dayOfWeek: 6, label: 'Día libre', slots: [baseSlot()] })
    return { ...structuredState(), variants: [base, sabado], activeVariantKey: 'v-sa' }
  }

  it('builderVariantForDayOfWeek: el dia propio gana, el resto hereda el base', () => {
    const state = multiDay()
    expect(builderVariantForDayOfWeek(state, 6).key).toBe('v-sa')
    for (const dow of [1, 2, 3, 4, 5, 0]) {
      expect(builderVariantForDayOfWeek(state, dow).key).toBe(BASE_VARIANT_KEY)
    }
    // `null` = el dia base explicito (unica puerta cuando ya no rige ningun dia).
    expect(builderVariantForDayOfWeek(state, null).key).toBe(BASE_VARIANT_KEY)
  })

  it('inheritedDayOfWeeks: los dias que comparten el base, en orden Lu->Do', () => {
    expect(inheritedDayOfWeeks(multiDay())).toEqual([1, 2, 3, 4, 5, 0])
    expect(inheritedDayOfWeeks(structuredState())).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('builderDayCells: 7 celdas Lu->Do con el dia propio marcado y las kcal de la pantalla', () => {
    const state = multiDay()
    const cells = builderDayCells(state, {
      kcalByVariantKey: { [BASE_VARIANT_KEY]: 2180, 'v-sa': 2640 },
      todayIso: '2026-08-01', // sabado
    })
    expect(cells.map((cell) => cell.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(cells.map((cell) => cell.shortLabel)).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    const sabado = cells.find((cell) => cell.dayOfWeek === 6)
    expect(sabado?.isOwnDay).toBe(true)
    expect(sabado?.inheritsBase).toBe(false)
    expect(sabado?.isToday).toBe(true)
    expect(sabado?.displayCalories).toBe(2640)
    expect(sabado?.caloriesSource).toBe('prescribed')
    const lunes = cells.find((cell) => cell.dayOfWeek === 1)
    expect(lunes?.isOwnDay).toBe(false)
    expect(lunes?.variant.id).toBe(BASE_VARIANT_KEY)
    expect(lunes?.displayCalories).toBe(2180)
  })

  it('builderDayCells: dia vacio cae a su objetivo (nunca a un 0 inventado)', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), strategy: 'structured' as const, targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' } }
    const cells = builderDayCells(state, { kcalByVariantKey: {} })
    expect(cells[0].prescribedCalories).toBeNull()
    expect(cells[0].displayCalories).toBe(2000)
    expect(cells[0].caloriesSource).toBe('target')
  })

  it('builderDayCells: las porciones cuentan como contenido del dia', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), strategy: 'structured' as const }
    state.variants[0].slots = [{ key: 'slot-a', name: 'Desayuno', startTime: '', items: [] }]
    const cells = builderDayCells(state, {
      kcalByVariantKey: { [BASE_VARIANT_KEY]: 320 },
      portionsByVariantKey: { [BASE_VARIANT_KEY]: 2 },
    })
    expect(cells[0].portionCount).toBe(2)
    expect(cells[0].displayCalories).toBe(320)
    expect(cells[0].caloriesSource).toBe('prescribed')
  })

  it('builderDowForVariant: dia propio -> su dia; base -> el dia preferido si lo hereda', () => {
    const state = multiDay()
    expect(builderDowForVariant(state, 'v-sa', 1)).toBe(6)
    expect(builderDowForVariant(state, BASE_VARIANT_KEY, 3)).toBe(3)
    // El dia preferido ya es propio => cae al primer dia que SI hereda el base.
    expect(builderDowForVariant(state, BASE_VARIANT_KEY, 6)).toBe(1)
  })

  it('builderDowForVariant: base sin dias => null (se selecciona aparte)', () => {
    const base = { ...createBaseVariant(), slots: [baseSlot()] }
    const sevenOwnDays = [1, 2, 3, 4, 5, 6, 0].map((dow) =>
      dayVariant({ key: 'v-' + dow, dayOfWeek: dow, slots: [baseSlot()] }),
    )
    const state = { ...structuredState(), variants: [base, ...sevenOwnDays] }
    expect(inheritedDayOfWeeks(state)).toEqual([])
    expect(builderDowForVariant(state, BASE_VARIANT_KEY, 1)).toBeNull()
  })

  it('initialBuilderDow: abre en HOY cuando el dia en edicion es el base', () => {
    const state = multiDay()
    // 2026-07-29 es miercoles y lo hereda el base => el creador abre en miercoles.
    expect(initialBuilderDow({ ...state, activeVariantKey: BASE_VARIANT_KEY }, '2026-07-29')).toBe(3)
    // Con un dia propio en edicion manda SU dia.
    expect(initialBuilderDow(state, '2026-07-29')).toBe(6)
  })
})

describe('builderReducer', () => {
  it('SET_STRATEGY structured siembra una primera franja', () => {
    const state = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    expect(next.strategy).toBe('structured')
    expect(next.variants).toHaveLength(1)
    expect(next.variants[0].slots).toHaveLength(1)
    expect(next.permissions.canRegisterFreely).toBe(false)
  })

  it('SET_STRATEGY flexible no crea franjas', () => {
    const state = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'flexible', firstSlotKey: 'k1' })
    expect(next.variants[0].slots).toHaveLength(0)
    expect(next.permissions.canRegisterFreely).toBe(true)
  })

  // Fix bug 2.3.5 de la auditoria (poda ola 3, SPEC nutrition-ui-poda punto 2): re-tocar la
  // MISMA tarjeta de estrategia reseteaba los permisos a defaults y, si era "flexible", vaciaba
  // TODAS las franjas de TODOS los dias sin aviso ni deshacer.
  it('SET_STRATEGY con la MISMA estrategia es un no-op total (no resetea permisos ni toca franjas)', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'k1',
    })
    // El coach edita un permiso y agrega una franja extra.
    state = builderReducer(state, { type: 'SET_PERMISSION', field: 'canAdjustPrescribedQuantity', value: false })
    state = builderReducer(state, { type: 'ADD_SLOT', variantKey: BASE_VARIANT_KEY, key: 'slot-b' })
    const before = state
    const after = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'ignored' })
    expect(after).toBe(before) // misma referencia: el reducer ni siquiera reconstruye el arbol.
  })

  it('un permiso editado por el coach se conserva al cambiar entre estrategias con franjas', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'k1',
    })
    // Default structured: canRegisterFreely = false. El coach lo prende a mano.
    state = builderReducer(state, { type: 'SET_PERMISSION', field: 'canRegisterFreely', value: true })
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'hybrid', firstSlotKey: 'k2' })
    expect(next.permissions.canRegisterFreely).toBe(true)
  })

  it('un permiso SIN tocar adopta el default de la nueva estrategia', () => {
    const state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'hybrid',
      firstSlotKey: 'k1',
    })
    expect(state.permissions.canRegisterFreely).toBe(true) // default hybrid, sin editar
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k2' })
    expect(next.permissions.canRegisterFreely).toBe(false) // vuelve al default estricto
  })

  it('nextPermissionsForStrategyChange conserva canSubstitute rehidratado aunque ninguna estrategia lo defaultee true', () => {
    const current = { ...defaultPermissionsFor('structured'), canSubstitute: true }
    const next = nextPermissionsForStrategyChange('structured', 'flexible', current)
    expect(next.canSubstitute).toBe(true)
  })

  it('slotsLostIfFlexible cuenta las franjas de TODAS las variantes (logica pura de la confirmacion)', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'k1',
    })
    expect(slotsLostIfFlexible(state)).toBe(1)
    state = builderReducer(state, { type: 'ADD_SLOT', variantKey: BASE_VARIANT_KEY, key: 'slot-b' })
    expect(slotsLostIfFlexible(state)).toBe(2)
    // El reducer SIGUE vaciando al despachar; la UI es quien pregunta antes usando este conteo.
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'flexible', firstSlotKey: 'ignored' })
    expect(slotsLostIfFlexible(next)).toBe(0)
    expect(next.variants[0].slots).toHaveLength(0)
  })

  // T2.6 F2 — anexar un dia sobre otro (D2: suma franjas, no pisa).
  it('APPEND_VARIANT_SLOTS_TO suma las franjas del origen sin tocar las del destino', () => {
    const targetSlot: BuilderSlot = { key: 'slot-t', name: 'Cena', startTime: '21:00', items: [] }
    const state: BuilderState = {
      ...structuredState(),
      variants: [
        { ...createBaseVariant(), slots: [baseSlot()] },
        { ...createBaseVariant(), key: 'v-mar', isDefault: false, dayOfWeek: 2, slots: [targetSlot] },
      ],
    }

    const next = builderReducer(state, {
      type: 'APPEND_VARIANT_SLOTS_TO',
      sourceVariantKey: BASE_VARIANT_KEY,
      targetVariantKey: 'v-mar',
      keySeed: 'seed-1',
    })

    const slots = next.variants[1].slots
    expect(slots.map((slot) => slot.name)).toEqual(['Cena', 'Desayuno'])
    // La franja del destino sobrevive intacta y la anexada llega con key propia (no la del origen).
    expect(slots[0]).toEqual(targetSlot)
    expect(slots[1].key).not.toBe('slot-a')
    // El origen no se toca.
    expect(next.variants[0].slots.map((slot) => slot.key)).toEqual(['slot-a'])
  })

  it('APPEND_VARIANT_SLOTS_TO dos veces DUPLICA la franja, con keys distintas', () => {
    const state: BuilderState = {
      ...structuredState(),
      variants: [
        { ...createBaseVariant(), slots: [baseSlot()] },
        { ...createBaseVariant(), key: 'v-mar', isDefault: false, dayOfWeek: 2, slots: [] },
      ],
    }
    const append = (previous: BuilderState, keySeed: string) =>
      builderReducer(previous, { type: 'APPEND_VARIANT_SLOTS_TO', sourceVariantKey: BASE_VARIANT_KEY, targetVariantKey: 'v-mar', keySeed })

    const twice = append(append(state, 'seed-1'), 'seed-2')
    const slots = twice.variants[1].slots
    // Es lo pedido (D2): anexar no empareja por nombre. La UI lo avisa antes de ejecutar.
    expect(slots.map((slot) => slot.name)).toEqual(['Desayuno', 'Desayuno'])
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(2)
  })

  it('APPEND_VARIANT_SLOTS_TO no hace nada sobre si mismo, sin destino o sin franjas', () => {
    const state: BuilderState = {
      ...structuredState(),
      variants: [
        { ...createBaseVariant(), slots: [baseSlot()] },
        { ...createBaseVariant(), key: 'v-vacio', isDefault: false, dayOfWeek: 2, slots: [] },
      ],
    }
    const noop = (patch: Partial<{ sourceVariantKey: string; targetVariantKey: string }>) =>
      builderReducer(state, {
        type: 'APPEND_VARIANT_SLOTS_TO',
        sourceVariantKey: BASE_VARIANT_KEY,
        targetVariantKey: 'v-vacio',
        keySeed: 'seed-1',
        ...patch,
      })

    expect(noop({ targetVariantKey: BASE_VARIANT_KEY })).toBe(state)
    expect(noop({ targetVariantKey: 'no-existe' })).toBe(state)
    // Origen sin franjas: nada que sumar.
    expect(noop({ sourceVariantKey: 'v-vacio', targetVariantKey: BASE_VARIANT_KEY })).toBe(state)
  })

  // T2.6 F1 — Deshacer el borrado de una franja. Antes el tacho del wizard borraba la franja entera
  // en el acto y sin vuelta atras; el contrato del undo es "vuelve DONDE estaba", no "vuelve".
  it('RESTORE_SLOT devuelve la franja a su indice original', () => {
    const middle: BuilderSlot = { key: 'slot-b', name: 'Almuerzo', startTime: '13:00', items: [] }
    const last: BuilderSlot = { key: 'slot-c', name: 'Cena', startTime: '21:00', items: [] }
    const state: BuilderState = {
      ...structuredState(),
      variants: [{ ...createBaseVariant(), slots: [baseSlot(), middle, last] }],
    }

    const removed = builderReducer(state, { type: 'REMOVE_SLOT', variantKey: BASE_VARIANT_KEY, slotKey: 'slot-b' })
    expect(removed.variants[0].slots.map((slot) => slot.key)).toEqual(['slot-a', 'slot-c'])

    const restored = builderReducer(removed, { type: 'RESTORE_SLOT', variantKey: BASE_VARIANT_KEY, index: 1, slot: middle })
    expect(restored.variants[0].slots.map((slot) => slot.key)).toEqual(['slot-a', 'slot-b', 'slot-c'])
    // La franja vuelve COMPLETA, no un cascaron con el mismo nombre.
    expect(restored.variants[0].slots[1]).toEqual(middle)
  })

  it('RESTORE_SLOT es idempotente y acota el indice fuera de rango', () => {
    const state = structuredState()
    const slot = state.variants[0].slots[0]

    // Doble clic en "Deshacer": la franja no se duplica.
    const twice = builderReducer(builderReducer(state, { type: 'RESTORE_SLOT', variantKey: BASE_VARIANT_KEY, index: 0, slot }), {
      type: 'RESTORE_SLOT',
      variantKey: BASE_VARIANT_KEY,
      index: 0,
      slot,
    })
    expect(twice.variants[0].slots).toHaveLength(1)

    // Indice pasado de largo (la franja se borro y ademas se borraron otras): al final, sin romper.
    const emptied = builderReducer(state, { type: 'REMOVE_SLOT', variantKey: BASE_VARIANT_KEY, slotKey: slot.key })
    const restored = builderReducer(emptied, { type: 'RESTORE_SLOT', variantKey: BASE_VARIANT_KEY, index: 99, slot })
    expect(restored.variants[0].slots.map((s) => s.key)).toEqual([slot.key])
  })

  it('ADD_ITEM con alimento precarga cantidad y unidad', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.variants[0].slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', variantKey: BASE_VARIANT_KEY, slotKey, key: 'itemK', food: FOOD })
    expect(state.variants[0].slots[0].items).toHaveLength(1)
    expect(state.variants[0].slots[0].items[0].quantity).toBe('50')
    expect(state.variants[0].slots[0].items[0].unit).toBe('g')
  })

  it('UPDATE_ITEM setea las macros custom del alimento libre', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.variants[0].slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', variantKey: BASE_VARIANT_KEY, slotKey, key: 'freeK', food: null })
    state = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey,
      itemKey: 'freeK',
      patch: { customName: 'Avena', quantity: '100', customCalories: '380', customProteinG: '13', customCarbsG: '67', customFatsG: '7' },
    })
    const item = state.variants[0].slots[0].items[0]
    expect(item.customName).toBe('Avena')
    expect(itemMacros(item).calories).toBe(380)
  })

  // F-02: reemplazos autorizados por item (append / dedupe / tope / remove).
  it('ADD_ITEM_SUBSTITUTION agrega, deduplica por foodId y respeta el tope', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.variants[0].slots[0].key
    const variantKey = BASE_VARIANT_KEY
    state = builderReducer(state, { type: 'ADD_ITEM', variantKey, slotKey, key: 'itemK', food: FOOD })

    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', key: 'sa', food: subA })
    expect(state.variants[0].slots[0].items[0].substitutions).toHaveLength(1)

    // Mismo foodId => no duplica.
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', key: 'sa2', food: subA })
    expect(state.variants[0].slots[0].items[0].substitutions).toHaveLength(1)

    // No permite ofrecer el propio alimento prescrito (FOOD) como reemplazo.
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', key: 'sSelf', food: FOOD })
    expect(state.variants[0].slots[0].items[0].substitutions).toHaveLength(1)

    // Llena hasta el tope y confirma que no lo supera.
    for (let i = 0; i < MAX_ITEM_SUBSTITUTIONS + 3; i += 1) {
      const f: BuilderFood = { ...FOOD, id: `f-${i}-8888-4888-8888-888888888888`, name: `Alt ${i}` }
      state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', key: `k${i}`, food: f })
    }
    expect(state.variants[0].slots[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
  })

  it('REMOVE_ITEM_SUBSTITUTION quita por key', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.variants[0].slots[0].key
    const variantKey = BASE_VARIANT_KEY
    state = builderReducer(state, { type: 'ADD_ITEM', variantKey, slotKey, key: 'itemK', food: FOOD })
    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', key: 'sa', food: subA })
    state = builderReducer(state, { type: 'REMOVE_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: 'itemK', subKey: 'sa' })
    expect(state.variants[0].slots[0].items[0].substitutions).toHaveLength(0)
  })
})

// Respaldo local de borradores (W3b): RESTORE reemplaza el arbol completo desde un
// borrador persistido, con clamp defensivo del step y rechazo de payloads corruptos.
describe('builderReducer — RESTORE', () => {
  it('reemplaza el estado completo por el payload restaurado', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const restored = structuredState()
    const next = builderReducer(current, { type: 'RESTORE', state: restored })
    expect(next).toEqual(restored)
    // No conserva nada del estado previo (era vacio: strategy null, sin nombre).
    expect(next.strategy).toBe('structured')
    expect(next.planName).toBe('Plan estructurado')
    expect(next.variants[0].slots).toHaveLength(1)
  })

  it('clampa un step por encima del rango a BUILDER_STEP_COUNT - 1', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: 99 } })
    expect(next.step).toBe(BUILDER_STEP_COUNT - 1)
  })

  it('clampa un step negativo a 0', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: -5 } })
    expect(next.step).toBe(0)
  })

  it('un step no finito cae a 0', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: Number.NaN } })
    expect(next.step).toBe(0)
  })

  it('ignora un payload corrupto (sin variants ni slots) y conserva el estado actual por referencia', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const corrupt = { ...structuredState(), variants: null, slots: null } as unknown as BuilderState
    const next = builderReducer(current, { type: 'RESTORE', state: corrupt })
    expect(next).toBe(current)
  })

  it('ignora un payload null y conserva el estado actual', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: null as unknown as BuilderState })
    expect(next).toBe(current)
  })

  // Las notas visibles son carry-over del plan, no contenido del wizard: un borrador guardado
  // ANTES del carry-over no las trae y restaurarlo NO puede borrarlas.
  it('un borrador PRE-notas conserva las notas visibles del plan rehidratado', () => {
    const current = { ...createEmptyBuilderState('2026-07-20'), visibleNotes: 'Domingo comida libre' }
    const legacy: Record<string, unknown> = { ...structuredState() }
    delete legacy.visibleNotes
    const next = builderReducer(current, { type: 'RESTORE', state: legacy })
    expect(next.visibleNotes).toBe('Domingo comida libre')
    expect(next.planName).toBe('Plan estructurado')
  })

  it('un borrador que SI trae la clave manda (incluso si las dejo vacias)', () => {
    const current = { ...createEmptyBuilderState('2026-07-20'), visibleNotes: 'Vieja' }
    const next = builderReducer(current, {
      type: 'RESTORE',
      state: { ...structuredState(), visibleNotes: null },
    })
    expect(next.visibleNotes).toBeNull()
  })
})

describe('insert row builders (args del servidor)', () => {
  const item: DraftPrescriptionItem = {
    foodId: FOOD_ID,
    recipeId: null,
    customName: null,
    quantity: 200,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    orderIndex: 0,
  }

  it('buildItemInsertRow re-deriva macros de snapshot desde el alimento', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item, food: FOOD })
    expect(row.version_id).toBe('v1')
    expect(row.meal_slot_id).toBe('s1')
    expect(row.food_id).toBe(FOOD_ID)
    expect(row.snapshot_name).toBe('Pollo')
    expect(row.snapshot_calories).toBe(200)
    expect(row.snapshot_protein_g).toBe(20)
    expect(row.snapshot_fiber_g).toBe(4)
  })

  it('buildItemInsertRow para item custom deja macros en null', () => {
    const custom: DraftPrescriptionItem = { ...item, foodId: null, customName: 'Colacion libre' }
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 1, item: custom, food: null })
    expect(row.food_id).toBeNull()
    expect(row.snapshot_name).toBe('Colacion libre')
    expect(row.snapshot_calories).toBeNull()
  })

  it('buildVariantInsertRow y buildSlotInsertRow mapean columnas de BD', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const variantRow = buildVariantInsertRow('v1', draft.dayVariants[0])
    expect(variantRow.version_id).toBe('v1')
    expect(variantRow.is_default).toBe(true)
    expect(variantRow.target_calories).toBe(2000)
    const slotRow = buildSlotInsertRow('v1', 'var1', draft.dayVariants[0].mealSlots[0])
    expect(slotRow.day_variant_id).toBe('var1')
    expect(slotRow.slot_code).toBe('slot-1')
    expect(slotRow.name).toBe('Desayuno')
  })
})

// ── Multi-dia (SPEC nutrition-multiday): variantes de dia en el wizard ────────────────────────

describe('builderReducer — ADD_VARIANTS', () => {
  it("origen 'copy-base' CLONA franjas, items y reemplazos con keys derivadas (sin compartir objetos)", () => {
    const sub: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }
    const start = structuredState()
    start.variants[0].slots[0].items[0].substitutions = [{ key: 'sub-1', food: sub }]

    const next = builderReducer(start, { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sa', 'v-do'], origin: 'copy-base' })

    expect(next.variants).toHaveLength(3)
    expect(next.activeVariantKey).toBe('v-sa')
    const sabado = next.variants[1]
    expect(sabado.dayOfWeek).toBe(6)
    expect(sabado.label).toBe('Sábado')
    expect(sabado.isDefault).toBe(false)
    expect(sabado.targetsMode).toBe('inherit')
    // Mismo contenido, keys derivadas y objetos NUEVOS (editar el sabado no toca el base).
    expect(sabado.slots).toHaveLength(1)
    expect(sabado.slots[0].key).toBe(clonedKey('v-sa', 'slot-a'))
    expect(sabado.slots[0].name).toBe('Desayuno')
    expect(sabado.slots[0].items[0].key).toBe(clonedKey('v-sa', 'i1'))
    expect(sabado.slots[0].items[0].food?.id).toBe(FOOD_ID)
    expect(sabado.slots[0].items[0].substitutions[0].key).toBe(clonedKey('v-sa', 'sub-1'))
    expect(sabado.slots[0]).not.toBe(start.variants[0].slots[0])
    expect(sabado.slots[0].items[0]).not.toBe(start.variants[0].slots[0].items[0])
    // El domingo tambien se creo, con sus propias keys.
    expect(next.variants[2].dayOfWeek).toBe(0)
    expect(next.variants[2].slots[0].key).toBe(clonedKey('v-do', 'slot-a'))
  })

  it("origen 'empty' crea el dia sin franjas", () => {
    const next = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sa'],
      origin: 'empty',
    })
    expect(next.variants[1].slots).toHaveLength(0)
  })

  it('ignora dias ya ocupados, repetidos e invalidos (invariante dayOfWeek unico)', () => {
    const start = { ...structuredState(), variants: [createBaseVariant(), dayVariant({ key: 'v-sa', dayOfWeek: 6 })] }
    const next = builderReducer(start, {
      type: 'ADD_VARIANTS',
      days: [6, 3, 3, 9],
      keys: ['x1', 'x2', 'x3', 'x4'],
      origin: 'empty',
    })
    // Solo entra el miercoles (3): el 6 esta ocupado, el 3 repetido se descarta y el 9 no existe.
    expect(next.variants.map((variant) => variant.dayOfWeek)).toEqual([null, 6, 3])
  })

  it('no pasa del tope de 7 dias especificos', () => {
    let state = structuredState()
    state = builderReducer(state, {
      type: 'ADD_VARIANTS',
      days: [1, 2, 3, 4, 5, 6, 0],
      keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      origin: 'empty',
    })
    expect(state.variants).toHaveLength(MAX_DAY_VARIANTS + 1)
    const same = builderReducer(state, { type: 'ADD_VARIANTS', days: [1], keys: ['h'], origin: 'empty' })
    expect(same).toBe(state)
  })
})

describe('builderReducer — invariantes de las variantes', () => {
  it('REMOVE_VARIANT jamas elimina el dia base y reactiva el base si borro el activo', () => {
    let state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sa'],
      origin: 'copy-base',
    })
    expect(state.activeVariantKey).toBe('v-sa')
    const untouched = builderReducer(state, { type: 'REMOVE_VARIANT', variantKey: BASE_VARIANT_KEY })
    expect(untouched).toBe(state)

    state = builderReducer(state, { type: 'REMOVE_VARIANT', variantKey: 'v-sa' })
    expect(state.variants).toHaveLength(1)
    expect(state.activeVariantKey).toBe(BASE_VARIANT_KEY)
  })

  it('SET_VARIANT_DAY no toca el base ni pisa un dia ocupado, y arrastra la etiqueta automatica', () => {
    let state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6, 0],
      keys: ['v-sa', 'v-do'],
      origin: 'empty',
    })
    // El base no cambia de dia.
    expect(builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: BASE_VARIANT_KEY, dayOfWeek: 2 })).toBe(state)
    // Domingo ya ocupado => no-op.
    expect(builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sa', dayOfWeek: 0 })).toBe(state)

    state = builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sa', dayOfWeek: 3 })
    expect(state.variants[1].dayOfWeek).toBe(3)
    expect(state.variants[1].label).toBe('Miércoles')

    // Etiqueta escrita por el coach: cambiar de dia NO la pisa.
    state = builderReducer(state, { type: 'SET_VARIANT_LABEL', variantKey: 'v-sa', value: 'Dia de pierna' })
    state = builderReducer(state, { type: 'SET_VARIANT_DAY', variantKey: 'v-sa', dayOfWeek: 4 })
    expect(state.variants[1].label).toBe('Dia de pierna')
  })

  it('DUPLICATE_VARIANT_AS clona el origen (incluidas sus metas propias) en un dia libre', () => {
    let state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sa'],
      origin: 'copy-base',
    })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sa', mode: 'custom' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-sa', field: 'calories', value: '2600' })
    state = builderReducer(state, { type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: 'v-sa', key: 'v-do', dayOfWeek: 0 })

    const domingo = state.variants[2]
    expect(domingo.dayOfWeek).toBe(0)
    expect(domingo.targetsMode).toBe('custom')
    expect(domingo.targets.calories).toBe('2600')
    expect(domingo.slots[0].key).toBe(clonedKey('v-do', clonedKey('v-sa', 'slot-a')))
    expect(state.activeVariantKey).toBe('v-do')
  })

  it('SET_VARIANT_TARGETS_MODE siembra las metas del base y no aplica al base', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sa'], origin: 'empty' })
    expect(builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: BASE_VARIANT_KEY, mode: 'custom' })).toBe(state)

    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sa', mode: 'custom' })
    expect(state.variants[1].targets).toEqual(state.targets)
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sa', mode: 'inherit' })
    expect(state.variants[1].targetsMode).toBe('inherit')
  })

  it('normalizeBuilderVariants deja exactamente una default y descarta dias duplicados', () => {
    const normalized = normalizeBuilderVariants([
      { ...createBaseVariant(), key: 'a' },
      { ...createBaseVariant(), key: 'b' },
      dayVariant({ key: 'c', dayOfWeek: 6 }),
      dayVariant({ key: 'd', dayOfWeek: 6 }),
      dayVariant({ key: 'e', dayOfWeek: 99 as number }),
    ])
    expect(normalized.map((variant) => variant.key)).toEqual(['a', 'c'])
    expect(normalized.filter((variant) => variant.isDefault)).toHaveLength(1)
    expect(normalized[0].dayOfWeek).toBeNull()
  })
})

// ── Copia de una franja a otros dias (P0-4) ───────────────────────────────────────────────

describe('builderReducer — COPY_SLOT_TO_VARIANTS', () => {
  const SUB: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }

  /** Base con "Desayuno" (slot-a, con un reemplazo) + sabado y domingo VACIOS. */
  function weekState(): BuilderState {
    const start = structuredState()
    start.variants[0].slots[0].items[0].substitutions = [{ key: 'sub-1', food: SUB }]
    return builderReducer(start, { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sa', 'v-do'], origin: 'empty' })
  }

  function copyTo(state: BuilderState, targetVariantKeys: string[]): BuilderState {
    return builderReducer(state, {
      type: 'COPY_SLOT_TO_VARIANTS',
      sourceVariantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      targetVariantKeys,
    })
  }

  it('copia la franja completa a un dia: la agrega al final con keys nuevas y sin tocar el origen', () => {
    const start = weekState()
    const next = copyTo(start, ['v-sa'])

    const sabado = next.variants[1]
    const copied = sabado.slots[0]
    expect(sabado.slots).toHaveLength(1)
    expect(copied.name).toBe('Desayuno')
    expect(copied.startTime).toBe('08:00')
    expect(copied.items[0].food?.id).toBe(FOOD_ID)
    expect(copied.items[0].quantity).toBe('200')
    expect(copied.items[0].substitutions[0].food.id).toBe(SUB.id)
    // Keys NUEVAS derivadas del destino (nada compartido con el origen).
    expect(copied.key).toBe(clonedKey('v-sa', 'slot-a'))
    expect(copied.items[0].key).toBe(clonedKey(clonedKey('v-sa', 'slot-a'), 'i1'))
    expect(copied.items[0].substitutions[0].key).toBe(clonedKey(clonedKey('v-sa', 'slot-a'), 'sub-1'))
    expect(copied).not.toBe(start.variants[0].slots[0])
    expect(copied.items[0]).not.toBe(start.variants[0].slots[0].items[0])
    // El dia de origen y los dias que no eran destino quedan INTACTOS (misma referencia).
    expect(next.variants[0]).toBe(start.variants[0])
    expect(next.variants[2]).toBe(start.variants[2])
  })

  it('"aplicar a todos los dias": copia a N destinos en un gesto, cada uno con sus keys', () => {
    const next = copyTo(weekState(), ['v-sa', 'v-do'])
    expect(next.variants[1].slots[0].key).toBe(clonedKey('v-sa', 'slot-a'))
    expect(next.variants[2].slots[0].key).toBe(clonedKey('v-do', 'slot-a'))
    expect(next.variants[1].slots[0].items[0].food?.id).toBe(FOOD_ID)
    expect(next.variants[2].slots[0].items[0].food?.id).toBe(FOOD_ID)
    // Cada dia con objetos propios: editar uno no toca al otro.
    expect(next.variants[1].slots[0]).not.toBe(next.variants[2].slots[0])
    // El draft ensamblado numera los codigos por dia y pasa el contrato.
    const draft = assembleAndValidateDraft(next, { clientId: CLIENT_ID })
    expect(draft.dayVariants.map((variant) => variant.mealSlots.map((slot) => slot.code))).toEqual([
      ['slot-1'],
      ['slot-1'],
      ['slot-1'],
    ])
  })

  it('merge por NOMBRE (trim + mayusculas): reemplaza la franja homonima en su posicion, no duplica', () => {
    const start: BuilderState = {
      ...structuredState(),
      variants: [
        { ...createBaseVariant(), slots: [baseSlot()] },
        dayVariant({
          key: 'v-sa',
          dayOfWeek: 6,
          slots: [
            { key: 's-alm', name: 'Almuerzo', startTime: '13:00', items: [] },
            { key: 's-des', name: '  DESAYUNO ', startTime: '09:30', items: [customItem()] },
          ],
        }),
      ],
    }
    const next = copyTo(start, ['v-sa'])
    const sabado = next.variants[1]

    // Sigue habiendo 2 franjas, en el MISMO orden y con la key/posicion del destino.
    expect(sabado.slots).toHaveLength(2)
    expect(sabado.slots.map((slot) => slot.key)).toEqual(['s-alm', 's-des'])
    // El contenido del destino se reemplaza completo por el del origen (nombre incluido).
    expect(sabado.slots[1].name).toBe('Desayuno')
    expect(sabado.slots[1].startTime).toBe('08:00')
    expect(sabado.slots[1].items).toHaveLength(1)
    expect(sabado.slots[1].items[0].food?.id).toBe(FOOD_ID)
    expect(sabado.slots[1].items[0].key).toBe(clonedKey('s-des', 'i1'))
    // La otra franja del dia no se toca.
    expect(sabado.slots[0]).toBe(start.variants[1].slots[0])
    expect(slotMergeName('  DESAYUNO ')).toBe('desayuno')
  })

  it('aplicar dos veces deja la MISMA estructura (idempotente)', () => {
    const once = copyTo(weekState(), ['v-sa', 'v-do'])
    const twice = copyTo(once, ['v-sa', 'v-do'])
    expect(twice.variants).toEqual(once.variants)
  })

  it('cinturones: sin destinos validos es no-op; el origen y los repetidos se ignoran', () => {
    const start = weekState()
    expect(copyTo(start, [])).toBe(start)
    // El propio dia de origen jamas es destino, y un dia inexistente se descarta.
    expect(copyTo(start, [BASE_VARIANT_KEY, 'fantasma'])).toBe(start)
    // Franja inexistente => estado intacto.
    expect(
      builderReducer(start, {
        type: 'COPY_SLOT_TO_VARIANTS',
        sourceVariantKey: BASE_VARIANT_KEY,
        slotKey: 'no-existe',
        targetVariantKeys: ['v-sa'],
      }),
    ).toBe(start)
    // Un destino repetido en la misma accion se aplica UNA sola vez.
    expect(copyTo(start, ['v-sa', 'v-sa']).variants[1].slots).toHaveLength(1)
  })

  it('resolveSlotCopyTargets desambigua la key cuando el dia ya la tiene ocupada (clon renombrado)', () => {
    // El sabado nacio de "copiar del base" (key `v-sa~slot-a`) y despues renombro la franja:
    // ya no hay match por nombre, pero la key derivada esta OCUPADA.
    let state = builderReducer(structuredState(), {
      type: 'ADD_VARIANTS',
      days: [6],
      keys: ['v-sa'],
      origin: 'copy-base',
    })
    state = builderReducer(state, {
      type: 'UPDATE_SLOT',
      variantKey: 'v-sa',
      slotKey: clonedKey('v-sa', 'slot-a'),
      patch: { name: 'Colación' },
    })
    const targets = resolveSlotCopyTargets(state, {
      sourceVariantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      targetVariantKeys: ['v-sa'],
    })
    expect(targets).toEqual([{ variantKey: 'v-sa', slotKey: clonedKey('v-sa', 'slot-a') + '~2', replaced: false }])

    const next = copyTo(state, ['v-sa'])
    const keys = next.variants[1].slots.map((slot) => slot.key)
    expect(keys).toEqual([clonedKey('v-sa', 'slot-a'), clonedKey('v-sa', 'slot-a') + '~2'])
    expect(new Set(keys).size).toBe(2)
  })

  it('resolveSlotCopyTargets marca `replaced` en el merge por nombre y da la key del destino', () => {
    const start: BuilderState = {
      ...structuredState(),
      variants: [
        { ...createBaseVariant(), slots: [baseSlot()] },
        dayVariant({ key: 'v-sa', dayOfWeek: 6, slots: [{ key: 's-des', name: 'desayuno', startTime: '', items: [] }] }),
        dayVariant({ key: 'v-do', dayOfWeek: 0, slots: [] }),
      ],
    }
    expect(
      resolveSlotCopyTargets(start, {
        sourceVariantKey: BASE_VARIANT_KEY,
        slotKey: 'slot-a',
        targetVariantKeys: ['v-sa', 'v-do'],
      }),
    ).toEqual([
      { variantKey: 'v-sa', slotKey: 's-des', replaced: true },
      { variantKey: 'v-do', slotKey: clonedKey('v-do', 'slot-a'), replaced: false },
    ])
  })
})

describe('migrateBuilderState (borrador v1 -> v2)', () => {
  it('convierte el arbol viejo { slots } en el dia base, sin perder nada', () => {
    const migrated = migrateBuilderState(legacyStatePayload(), '2026-07-25')
    expect(migrated).not.toBeNull()
    expect(migrated?.variants).toHaveLength(1)
    expect(migrated?.variants[0].isDefault).toBe(true)
    expect(migrated?.variants[0].key).toBe(BASE_VARIANT_KEY)
    expect(migrated?.variants[0].slots[0].items[0].food?.id).toBe(FOOD_ID)
    expect(migrated?.activeVariantKey).toBe(BASE_VARIANT_KEY)
    expect(migrated?.planName).toBe('Plan viejo')
    expect(migrated?.targets.calories).toBe('2100')
    // El borrador viejo venia del wizard de 4 pasos (`step: 2` = "Construccion"): con dos pasos
    // re-clampa al ultimo, que es justo donde vive esa construccion ahora.
    expect(migrated?.step).toBe(BUILDER_STEP_DAYS)
  })

  it('RESTORE acepta un borrador v1 y lo migra (los borradores guardados no se pierden)', () => {
    const current = createEmptyBuilderState('2026-07-25')
    const next = builderReducer(current, { type: 'RESTORE', state: legacyStatePayload() })
    expect(next.variants).toHaveLength(1)
    expect(next.variants[0].slots).toHaveLength(1)
    expect(next.planName).toBe('Plan viejo')
  })

  it('conserva las variantes del formato nuevo y repara la variante activa huerfana', () => {
    const payload = {
      ...structuredState(),
      variants: [createBaseVariant(), dayVariant({ key: 'v-sa', dayOfWeek: 6, label: 'Sábado' })],
      activeVariantKey: 'no-existe',
    }
    const migrated = migrateBuilderState(payload, '2026-07-25')
    expect(migrated?.variants).toHaveLength(2)
    expect(migrated?.activeVariantKey).toBe(BASE_VARIANT_KEY)
  })

  it('devuelve null ante basura (el caller conserva su estado)', () => {
    expect(migrateBuilderState(null, '2026-07-25')).toBeNull()
    expect(migrateBuilderState({ foo: 1 }, '2026-07-25')).toBeNull()
    expect(migrateBuilderState('nope', '2026-07-25')).toBeNull()
  })
})

describe('assembleDraft — N variantes de dia', () => {
  function multiDayState(): BuilderState {
    let state = structuredState()
    state = builderReducer(state, { type: 'ADD_VARIANTS', days: [6, 0], keys: ['v-sa', 'v-do'], origin: 'copy-base' })
    // El sabado personaliza sus metas; el domingo hereda las del base.
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS_MODE', variantKey: 'v-sa', mode: 'custom' })
    state = builderReducer(state, { type: 'SET_VARIANT_TARGETS', variantKey: 'v-sa', field: 'calories', value: '2600' })
    // Ajuste del almuerzo del sabado: cambia la cantidad del item clonado.
    state = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: 'v-sa',
      slotKey: clonedKey('v-sa', 'slot-a'),
      itemKey: clonedKey('v-sa', 'i1'),
      patch: { quantity: '350' },
    })
    return state
  }

  it('emite una variante por dia con dayOfWeek, default y orderIndex correctos', () => {
    const draft = assembleAndValidateDraft(multiDayState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants).toHaveLength(3)
    expect(draft.dayVariants.map((variant) => variant.dayOfWeek)).toEqual([null, 6, 0])
    expect(draft.dayVariants.map((variant) => variant.default)).toEqual([true, false, false])
    expect(draft.dayVariants.map((variant) => variant.orderIndex)).toEqual([0, 1, 2])
    expect(draft.dayVariants[1].label).toBe('Sábado')
    expect(draft.dayVariants[1].key).toBe('v-sa')
  })

  it('la variante inherit CONGELA las metas del base y la custom usa las suyas', () => {
    const draft = assembleAndValidateDraft(multiDayState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].targets.calories).toBe(2000)
    expect(draft.dayVariants[1].targets.calories).toBe(2600)
    expect(draft.dayVariants[1].targets.proteinG).toBe(150)
    // Domingo hereda: mismas metas que el base, ya congeladas en el payload.
    expect(draft.dayVariants[2].targets.calories).toBe(2000)
    expect(draft.dayVariants[2].targets.proteinG).toBe(150)
  })

  it('cada dia lleva sus propias franjas e items (editar el sabado no toca el base)', () => {
    const draft = assembleAndValidateDraft(multiDayState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots[0].items[0].quantity).toBe(200)
    expect(draft.dayVariants[1].mealSlots[0].items[0].quantity).toBe(350)
    expect(draft.dayVariants[2].mealSlots[0].items[0].quantity).toBe(200)
    // El codigo de franja se numera DENTRO del dia.
    expect(draft.dayVariants[1].mealSlots[0].code).toBe('slot-1')
  })

  it('un plan de un solo dia emite exactamente la variante de siempre', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants).toHaveLength(1)
    expect(draft.dayVariants[0].key).toBe('default')
    expect(draft.dayVariants[0].default).toBe(true)
    expect(draft.dayVariants[0].dayOfWeek).toBeNull()
  })

  it('validateStep del paso "Los dias" revisa TODOS los dias, no solo el activo', () => {
    let state = builderReducer(structuredState(), { type: 'ADD_VARIANTS', days: [6], keys: ['v-sa'], origin: 'empty' })
    // El dia activo (sabado) esta vacio.
    let result = validateStep(state, BUILDER_STEP_DAYS)
    expect(result.ok).toBe(false)
    expect(result.errors['variant.v-sa.slots']).toBeTruthy()

    // Con franja en el sabado pero un item invalido en el BASE, tampoco pasa.
    state = builderReducer(state, { type: 'ADD_SLOT', variantKey: 'v-sa', key: 'slot-sa' })
    state = builderReducer(state, { type: 'UPDATE_SLOT', variantKey: 'v-sa', slotKey: 'slot-sa', patch: { name: 'Cena' } })
    state = builderReducer(state, { type: 'SET_ACTIVE_VARIANT', variantKey: 'v-sa' })
    state = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      itemKey: 'i1',
      patch: { quantity: '0' },
    })
    result = validateStep(state, BUILDER_STEP_DAYS)
    expect(result.ok).toBe(false)
    expect(result.errors['item.i1.quantity']).toBeTruthy()
  })
})

/**
 * W1.1 «Cantidades honestas»: el wizard tiene reductor propio y `UPDATE_ITEM` era un merge
 * ciego del patch. Cambiar la unidad dejaba la cantidad quieta, asi que "200" pasaba de 200 g a
 * 200 PORCIONES. La conversion sale del mismo helper puro del paquete que usan el editor unico
 * (`SET_ITEM_UNIT`) y el wizard RN.
 */
describe('builderReducer UPDATE_ITEM · cambio de unidad', () => {
  function itemAfter(patch: Partial<Omit<BuilderItem, 'key'>>, item: BuilderItem = foodItem()): BuilderItem {
    const state: BuilderState = {
      ...structuredState(),
      variants: [{ ...createBaseVariant(), slots: [{ ...baseSlot(), items: [item] }] }],
    }
    const next = builderReducer(state, {
      type: 'UPDATE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'slot-a',
      itemKey: item.key,
      patch,
    })
    return next.variants[0].slots[0].items[0]
  }

  it('g → un divide por la porcion del alimento (200 g con porcion 50 ⇒ 4 un)', () => {
    const item = itemAfter({ unit: 'un' })
    expect(item.unit).toBe('un')
    expect(item.quantity).toBe('4')
  })

  it('un → g multiplica por la porcion (4 un con porcion 50 ⇒ 200 g)', () => {
    const item = itemAfter({ unit: 'g' }, foodItem({ quantity: '4', unit: 'un' }))
    expect(item.quantity).toBe('200')
  })

  it('g → ml conserva el numero (misma base per-100)', () => {
    expect(itemAfter({ unit: 'ml' }).quantity).toBe('200')
  })

  it('un patch con cantidad propia manda: ahi el coach escribio el numero', () => {
    const item = itemAfter({ unit: 'un', quantity: '3' })
    expect(item.unit).toBe('un')
    expect(item.quantity).toBe('3')
  })

  it('un alimento libre no tiene porcion con que convertir: la cantidad no se toca', () => {
    const item = itemAfter({ unit: 'un' }, customItem({ quantity: '200', unit: 'g' }))
    expect(item.unit).toBe('un')
    expect(item.quantity).toBe('200')
  })

  it('un patch que no cambia la unidad deja la cantidad intacta', () => {
    expect(itemAfter({ notes: 'Sin sal' }).quantity).toBe('200')
    expect(itemAfter({ unit: 'g' }).quantity).toBe('200')
  })
})
