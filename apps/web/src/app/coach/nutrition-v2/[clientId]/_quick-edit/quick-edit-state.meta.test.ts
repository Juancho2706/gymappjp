import { describe, expect, it } from 'vitest'
import {
  NutritionPlanDraftSchema,
  buildTemplatePayload,
  countDraftChanges,
  parseTemplatePayload,
  readModelToDraft,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import {
  applyQuickEditToDraft,
  countItemOrderChanges,
  countItemSubstitutionChanges,
  draftToEditState,
  qeAllowedStrategies,
  quickEditReducer,
  readModelToEditState,
  validateQuickEdit,
  withSyntheticDraftIds,
  PLAN_NAME_MAX,
  type QePortionGroup,
  type QuickEditState,
} from '@eva/nutrition-v2'
import type { BuilderFood } from '../builder/_lib/draft-builder'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'

// Metadatos del plan (editor unico T3.x): la extension `state.meta` debe ser INVISIBLE para el
// quick-edit clasico (sin meta = proyeccion y acciones identicas a siempre) y, con meta, cada
// edicion de nombre/estrategia/permisos debe mover el contador y producir un draft Zod-valido.

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'

function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-15T12:00:00+00:00',
    asOfDate: '2026-08-15',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de prueba',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-08-10',
      effectiveTo: null,
    },
    visibleNotes: 'Toma agua',
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [
      {
        id: VARIANT_ID,
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: {
          calories: 2200,
          proteinG: 160,
          carbsG: 220,
          fatsG: 70,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [
          {
            id: SLOT_ID,
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
                id: ITEM_ID,
                foodId: FOOD_ID,
                recipeId: null,
                name: 'Avena',
                brand: null,
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  }
}

function hydrateWithMeta(): QuickEditState {
  const state = readModelToEditState(makePlanModel(), {}, { withMeta: true })
  if (!state) throw new Error('fixture sin plan')
  return state
}

function draftOf(state: QuickEditState) {
  const baseDraft = readModelToDraft(makePlanModel(), CLIENT_ID)
  if (!baseDraft) throw new Error('fixture sin plan')
  return applyQuickEditToDraft(baseDraft, state)
}

describe('quick-edit-state meta (editor unico)', () => {
  it('sin withMeta el estado NO trae meta (quick-edit clasico intacto)', () => {
    const state = readModelToEditState(makePlanModel())
    expect(state?.meta).toBeUndefined()
  })

  it('withMeta hidrata nombre/estrategia/permisos del read model', () => {
    const state = hydrateWithMeta()
    expect(state.meta).toEqual({
      name: 'Plan de prueba',
      strategy: 'structured',
      permissions: makePlanModel().permissions,
    })
  })

  it('hidratar con meta y proyectar SIN editar sigue dando cero cambios', () => {
    const state = hydrateWithMeta()
    expect(countDraftChanges(draftOf(state), draftOf(state))).toBe(0)
  })

  it('editar nombre / estrategia / permiso cuenta 1 cambio cada uno y el draft valida', () => {
    const state = hydrateWithMeta()
    const baseline = draftOf(state)

    const renamed = quickEditReducer(state, { type: 'SET_PLAN_NAME', value: 'Plan corte' })
    expect(countDraftChanges(baseline, draftOf(renamed))).toBe(1)
    expect(draftOf(renamed).name).toBe('Plan corte')

    const restrategized = quickEditReducer(state, { type: 'SET_STRATEGY', value: 'flexible' })
    expect(countDraftChanges(baseline, draftOf(restrategized))).toBe(1)
    expect(draftOf(restrategized).strategy).toBe('flexible')

    const permitted = quickEditReducer(state, {
      type: 'SET_PERMISSION',
      patch: { canSubstitute: true },
    })
    expect(countDraftChanges(baseline, draftOf(permitted))).toBe(1)
    expect(draftOf(permitted).permissions.canSubstitute).toBe(true)

    for (const edited of [renamed, restrategized, permitted]) {
      expect(NutritionPlanDraftSchema.safeParse(draftOf(edited)).success).toBe(true)
    }
  })

  it('las acciones de meta son no-op sin meta (superficie clasica)', () => {
    const classic = readModelToEditState(makePlanModel())
    if (!classic) throw new Error('fixture sin plan')
    expect(quickEditReducer(classic, { type: 'SET_PLAN_NAME', value: 'X' })).toBe(classic)
    expect(quickEditReducer(classic, { type: 'SET_STRATEGY', value: 'flexible' })).toBe(classic)
    expect(
      quickEditReducer(classic, { type: 'SET_PERMISSION', patch: { canSubstitute: true } }),
    ).toBe(classic)
  })

  it('RESTORE_DRAFT no cruza superficies: el clasico descarta meta ajeno y el editor conserva el suyo', () => {
    const classic = readModelToEditState(makePlanModel())
    const editor = hydrateWithMeta()
    if (!classic) throw new Error('fixture sin plan')

    // Respaldo del editor (con meta editado) ofrecido en el quick-edit clasico → meta se descarta:
    // esa superficie no muestra nombre/permisos y publicaria un cambio invisible.
    const editorBackup = quickEditReducer(editor, { type: 'SET_PLAN_NAME', value: 'Otro nombre' })
    const restoredInClassic = quickEditReducer(classic, { type: 'RESTORE_DRAFT', state: editorBackup })
    expect(restoredInClassic.meta).toBeUndefined()

    // Respaldo pre-meta (sesion vieja) restaurado en el editor → conserva el meta vigente.
    const restoredInEditor = quickEditReducer(editor, { type: 'RESTORE_DRAFT', state: classic })
    expect(restoredInEditor.meta).toEqual(editor.meta)
  })

  it('SET_EFFECTIVE_FROM solo aplica cuando meta trae effectiveFrom (creacion)', () => {
    const editMode = hydrateWithMeta() // edicion: sin effectiveFrom en meta
    expect(quickEditReducer(editMode, { type: 'SET_EFFECTIVE_FROM', value: '2026-09-01' })).toBe(editMode)

    const creation: QuickEditState = {
      ...editMode,
      meta: { ...editMode.meta!, effectiveFrom: null },
    }
    const dated = quickEditReducer(creation, { type: 'SET_EFFECTIVE_FROM', value: '2026-09-01' })
    expect(dated.meta?.effectiveFrom).toBe('2026-09-01')
  })

  it('validacion de vigencia: fecha pasada o invalida corta (solo con today)', () => {
    const base = hydrateWithMeta()
    const withDate = (value: string | null): QuickEditState => ({
      ...base,
      meta: { ...base.meta!, effectiveFrom: value },
    })
    expect(
      validateQuickEdit(withDate('2026-08-01'), { today: '2026-08-15' }).errors['meta.effectiveFrom'],
    ).toBeTruthy()
    expect(
      validateQuickEdit(withDate('basura'), { today: '2026-08-15' }).errors['meta.effectiveFrom'],
    ).toBeTruthy()
    expect(validateQuickEdit(withDate('2026-08-20'), { today: '2026-08-15' }).ok).toBe(true)
    expect(validateQuickEdit(withDate(null), { today: '2026-08-15' }).ok).toBe(true)
  })

  it('validacion: nombre vacio o sobre el tope solo falla cuando hay meta', () => {
    const editor = hydrateWithMeta()
    const unnamed = quickEditReducer(editor, { type: 'SET_PLAN_NAME', value: '   ' })
    expect(validateQuickEdit(unnamed).errors['meta.name']).toBeTruthy()

    const overlong = quickEditReducer(editor, {
      type: 'SET_PLAN_NAME',
      value: 'x'.repeat(PLAN_NAME_MAX + 1),
    })
    expect(validateQuickEdit(overlong).errors['meta.name']).toBeTruthy()

    const classic = readModelToEditState(makePlanModel())
    if (!classic) throw new Error('fixture sin plan')
    expect(validateQuickEdit(classic).errors['meta.name']).toBeUndefined()
    expect(validateQuickEdit(editor).ok).toBe(true)
  })
})

// ── draftToEditState (modo creacion) ─────────────────────────────────────────────────────────

const TEMPLATE_FOOD: BuilderFood = {
  id: FOOD_ID,
  name: 'Arroz integral',
  brand: 'Marca X',
  calories: 360,
  proteinG: 7,
  carbsG: 76,
  fatsG: 2.5,
  fiberG: 4,
  servingSize: 100,
  servingUnit: 'g',
  category: 'cereal',
  media: null,
}

const GROUP_ID = '99999999-9999-4999-8999-999999999999'
const PORTION_GROUP: QePortionGroup = {
  exchangeGroupId: GROUP_ID,
  groupCode: 'C',
  groupName: 'Carbohidratos',
  color: '#f59e0b',
  ref: { calories: 130, proteinG: 2, carbsG: 28, fatsG: 0.5 },
  composedOf: null,
  macrosConfirmed: true,
}

function makeTemplateDraft(): NutritionPlanDraft {
  // Sin `planId`: en el contrato el campo es OPCIONAL (ausente = plan nuevo), nunca null.
  return {
    clientId: CLIENT_ID,
    name: 'Plantilla corte',
    strategy: 'structured',
    effectiveFrom: null,
    timezone: 'America/Santiago',
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visibleNotes: 'Nota de plantilla',
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        default: true,
        targets: {
          calories: 2000,
          proteinG: 150,
          carbsG: 200,
          fatsG: 60,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        orderIndex: 0,
        mealSlots: [
          {
            code: 'slot-1',
            name: 'Almuerzo',
            startTime: '13:00',
            endTime: null,
            mode: 'anchor',
            required: true,
            targets: {},
            instructions: null,
            orderIndex: 0,
            items: [
              {
                foodId: FOOD_ID,
                recipeId: null,
                customName: null,
                quantity: 150,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                orderIndex: 0,
              },
              {
                foodId: null,
                recipeId: null,
                customName: 'Ensalada libre',
                quantity: 1,
                unit: 'un',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: true,
                substitutionGroupId: null,
                notes: null,
                orderIndex: 1,
              },
            ],
            exchangeTargets: [
              {
                exchangeGroupId: GROUP_ID,
                portions: 2,
                notes: null,
                orderIndex: 0,
              },
              {
                exchangeGroupId: '10101010-1010-4010-8010-101010101010',
                portions: 1,
                notes: null,
                orderIndex: 1,
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('draftToEditState (creacion)', () => {
  it('hidrata items resolviendo foods, degrada visible lo no resuelto y trae meta con vigencia', () => {
    const draft = makeTemplateDraft()
    const state = draftToEditState(
      draft,
      { foodsById: { [FOOD_ID]: TEMPLATE_FOOD }, portionGroupsById: { [GROUP_ID]: PORTION_GROUP } },
      { effectiveFrom: null },
    )

    expect(state.meta).toMatchObject({
      name: 'Plantilla corte',
      strategy: 'structured',
      effectiveFrom: null,
    })
    const slot = state.variants[0]!.slots[0]!
    // Item de catalogo: nombre y food resueltos (macros en vivo via computeItemMacros).
    expect(slot.items[0]).toMatchObject({ displayName: 'Arroz integral', quantity: '150', isCustom: false })
    expect(slot.items[0]!.food?.id).toBe(FOOD_ID)
    // Item libre: nombre editable.
    expect(slot.items[1]).toMatchObject({ displayName: 'Ensalada libre', isCustom: true })
    // Target con grupo resuelto vs grupo desconocido (degradacion visible).
    expect(slot.portionTargets[0]).toMatchObject({ groupCode: 'C', groupName: 'Carbohidratos', portions: '2' })
    expect(slot.portionTargets[1]).toMatchObject({ groupName: 'Grupo no disponible' })
  })

  it('proyectar el estado hidratado sobre el mismo draft base produce un draft Zod-valido y baseline vacio cuenta todo como alta', () => {
    const draft = makeTemplateDraft()
    const state = draftToEditState(draft, { foodsById: { [FOOD_ID]: TEMPLATE_FOOD } }, { effectiveFrom: null })
    const projected = applyQuickEditToDraft(draft, state)
    expect(NutritionPlanDraftSchema.safeParse(projected).success).toBe(true)

    const emptyBaseline = applyQuickEditToDraft(draft, { variants: [], visibleNotes: '', meta: state.meta })
    expect(countDraftChanges(emptyBaseline, projected)).toBeGreaterThan(0)
  })

  it('sustituciones editables: alta con guardas, quitar por indice y deshacer idempotente', () => {
    const state = hydrateWithMeta()
    const at = { variantKey: VARIANT_ID, slotKey: SLOT_ID, itemKey: ITEM_ID }
    // Alimento DISTINTO del prescrito (el fixture del item usa FOOD_ID).
    const subFood = { ...TEMPLATE_FOOD, id: '12121212-1212-4212-8212-121212121212' }

    const added = quickEditReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', ...at, food: subFood })
    const subs = added.variants[0]!.slots[0]!.items[0]!.substitutions
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ foodId: subFood.id, displayName: 'Arroz integral' })

    // Guardas: mismo alimento dos veces = no-op; el propio alimento prescrito = no-op.
    // (no-op semantico: mapItem reconstruye el arbol, igual que el resto de acciones QE)
    expect(quickEditReducer(added, { type: 'ADD_ITEM_SUBSTITUTION', ...at, food: subFood })).toStrictEqual(added)
    const selfFood = { ...TEMPLATE_FOOD, id: FOOD_ID }
    expect(
      quickEditReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', ...at, food: selfFood }).variants[0]!.slots[0]!
        .items[0]!.substitutions,
    ).toHaveLength(0)

    // Quitar + deshacer restituye en el indice; doble deshacer no duplica.
    const removedSub = subs[0]!
    const removed = quickEditReducer(added, { type: 'REMOVE_ITEM_SUBSTITUTION', ...at, index: 0 })
    expect(removed.variants[0]!.slots[0]!.items[0]!.substitutions).toHaveLength(0)
    const restored = quickEditReducer(removed, { type: 'RESTORE_ITEM_SUBSTITUTION', ...at, index: 0, sub: removedSub })
    expect(restored.variants[0]!.slots[0]!.items[0]!.substitutions).toHaveLength(1)
    expect(quickEditReducer(restored, { type: 'RESTORE_ITEM_SUBSTITUTION', ...at, index: 0, sub: removedSub })).toStrictEqual(restored)

    // El delta de reemplazos cuenta (el paquete no los compara) y displayName NO se proyecta.
    const baseline = draftOf(state)
    const edited = draftOf(added)
    expect(countItemSubstitutionChanges(baseline, edited)).toBe(1)
    expect(countItemSubstitutionChanges(baseline, baseline)).toBe(0)
    const projectedSub = edited.dayVariants[0]!.mealSlots[0]!.items[0]!.substitutions?.[0]
    expect(projectedSub).toMatchObject({ foodId: subFood.id, orderIndex: 0 })
    expect(projectedSub && 'displayName' in projectedSub).toBe(false)
    expect(NutritionPlanDraftSchema.safeParse(edited).success).toBe(true)
  })

  it('APPLY_FOOD_OVERRIDE patchea solo items con food en mano (macroBase congelado intacto)', () => {
    const state = hydrateWithMeta()
    const at = { variantKey: VARIANT_ID, slotKey: SLOT_ID, itemKey: ITEM_ID }
    // Item hidratado (food null): el override no lo toca.
    const untouched = quickEditReducer(state, {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: { calories: 999, proteinG: 1, carbsG: 1, fatsG: 1, fiberG: 1 },
    })
    expect(untouched.variants[0]!.slots[0]!.items[0]!.food).toBeNull()

    // Tras un swap (food en mano) el override recomputa en vivo.
    const swapped = quickEditReducer(state, { type: 'SWAP_ITEM_FOOD', ...at, food: TEMPLATE_FOOD })
    const overridden = quickEditReducer(swapped, {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: TEMPLATE_FOOD.id,
      macros: { calories: 999, proteinG: 1, carbsG: 1, fatsG: 1, fiberG: 1 },
    })
    expect(overridden.variants[0]!.slots[0]!.items[0]!.food?.calories).toBe(999)
  })

  it('DUPLICATE_VARIANT_AS clona un dia especifico con sus metas; dia ocupado o dow invalido = no-op', () => {
    const state = hydrateWithMeta()
    const dup = quickEditReducer(state, {
      type: 'DUPLICATE_VARIANT_AS',
      sourceVariantKey: VARIANT_ID,
      dayOfWeek: 6,
      variantKey: 'dow-6',
    })
    expect(dup.variants).toHaveLength(2)
    expect(dup.variants[1]).toMatchObject({ dayOfWeek: 6, isDefault: false })
    expect(dup.variants[1]!.targets).toEqual(state.variants[0]!.targets)
    expect(dup.variants[1]!.slots).toHaveLength(1)

    // Dia ya ocupado = no-op; dow invalido = no-op; key repetida = no-op.
    expect(quickEditReducer(dup, { type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: VARIANT_ID, dayOfWeek: 6, variantKey: 'dow-6b' })).toBe(dup)
    expect(quickEditReducer(state, { type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: VARIANT_ID, dayOfWeek: 9, variantKey: 'x' })).toBe(state)
    expect(quickEditReducer(dup, { type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: VARIANT_ID, dayOfWeek: 3, variantKey: 'dow-6' })).toBe(dup)
  })

  it('COPY_VARIANT_TO_DAYS: replace conserva identidad del destino, append suma, dia libre se crea', () => {
    const base = hydrateWithMeta()
    // Dos dias propios: sabado (ocupado, con franja propia renombrada) y el origen sera el base.
    const withSaturday = quickEditReducer(base, {
      type: 'DUPLICATE_VARIANT_AS',
      sourceVariantKey: VARIANT_ID,
      dayOfWeek: 6,
      variantKey: 'dow-6',
    })
    const renamed = quickEditReducer(withSaturday, {
      type: 'SET_VARIANT_LABEL',
      variantKey: 'dow-6',
      value: 'Finde largo',
    })

    // REPLACE del base sobre sabado + creacion del domingo (0) en el mismo gesto.
    const copied = quickEditReducer(renamed, {
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: VARIANT_ID,
      days: [6, 0, 9], // 9 invalido: se ignora
      mode: 'replace',
      keySeed: 'seed-a',
    })
    expect(copied.variants).toHaveLength(3)
    const saturday = copied.variants.find((variant) => variant.key === 'dow-6')!
    // Identidad conservada (key + etiqueta del coach); contenido clonado del origen.
    expect(saturday.label).toBe('Finde largo')
    expect(saturday.slots).toHaveLength(1)
    expect(saturday.slots[0]!.key).not.toBe(base.variants[0]!.slots[0]!.key)
    const sunday = copied.variants.find((variant) => variant.dayOfWeek === 0)!
    expect(sunday.slots).toHaveLength(1)
    expect(sunday.isDefault).toBe(false)

    // APPEND: las franjas del origen se SUMAN a las del sabado (queda con 2).
    const appended = quickEditReducer(copied, {
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: VARIANT_ID,
      days: [6],
      mode: 'append',
      keySeed: 'seed-b',
    })
    expect(appended.variants.find((variant) => variant.key === 'dow-6')!.slots).toHaveLength(2)

    // Copiar sobre si mismo = no-op referencial.
    const self = quickEditReducer(copied, {
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: 'dow-6',
      days: [6],
      mode: 'replace',
      keySeed: 'seed-c',
    })
    expect(self).toBe(copied)

    // El resultado proyecta un draft Zod-valido.
    expect(NutritionPlanDraftSchema.safeParse(draftOf(appended)).success).toBe(true)
  })

  it('ADD_CATALOG_ITEM: prefill (porcion pegajosa) pisa el servingSize; sin prefill todo igual', () => {
    const state = hydrateWithMeta()
    const at = { variantKey: VARIANT_ID, slotKey: SLOT_ID }

    const plain = quickEditReducer(state, { type: 'ADD_CATALOG_ITEM', ...at, key: 'k1', food: TEMPLATE_FOOD })
    const plainItem = plain.variants[0]!.slots[0]!.items.at(-1)!
    expect(plainItem.quantity).toBe('100') // servingSize del catalogo

    const remembered = quickEditReducer(state, {
      type: 'ADD_CATALOG_ITEM',
      ...at,
      key: 'k2',
      food: TEMPLATE_FOOD,
      prefill: { quantity: '75', unit: 'g' },
    })
    const rememberedItem = remembered.variants[0]!.slots[0]!.items.at(-1)!
    expect(rememberedItem.quantity).toBe('75')
    expect(rememberedItem.unit).toBe('g')
  })

  it('REORDER_ITEM reordena dentro de la franja, clampa el indice y el contador local lo cuenta', () => {
    const state = hydrateWithMeta()
    const at = { variantKey: VARIANT_ID, slotKey: SLOT_ID }
    // Segundo item para tener algo que reordenar.
    const two = quickEditReducer(state, { type: 'ADD_CATALOG_ITEM', ...at, key: 'k-b', food: TEMPLATE_FOOD })
    const baseline = draftOf(two)

    const reordered = quickEditReducer(two, { type: 'REORDER_ITEM', ...at, itemKey: ITEM_ID, toIndex: 1 })
    expect(reordered.variants[0]!.slots[0]!.items.map((item) => item.key)).toEqual(['k-b', ITEM_ID])
    // El item nuevo no tiene id (cuenta como alta entera), asi que el orden de los COMPARTIDOS
    // no cambia el contador — reordenar dos items CON id si:
    const current = draftOf(reordered)
    // clamp: indice fuera de rango no revienta ni duplica
    const clamped = quickEditReducer(two, { type: 'REORDER_ITEM', ...at, itemKey: ITEM_ID, toIndex: 99 })
    expect(clamped.variants[0]!.slots[0]!.items).toHaveLength(2)
    // countItemOrderChanges con un solo item con id compartido = 0 (no hay orden relativo)
    expect(countItemOrderChanges(baseline, current)).toBe(0)

    // Con DOS items con id (hidratados): duplicamos el fixture del item para simularlo.
    const baseDraft = draftOf(state)
    const secondId = '20202020-2020-4020-8020-202020202020'
    const withTwoIds = {
      ...baseDraft,
      dayVariants: baseDraft.dayVariants.map((variant) => ({
        ...variant,
        mealSlots: variant.mealSlots.map((slot) => ({
          ...slot,
          items: [...slot.items, { ...slot.items[0]!, id: secondId, orderIndex: 1 }],
        })),
      })),
    }
    const swapped = {
      ...withTwoIds,
      dayVariants: withTwoIds.dayVariants.map((variant) => ({
        ...variant,
        mealSlots: variant.mealSlots.map((slot) => ({
          ...slot,
          items: [...slot.items].reverse(),
        })),
      })),
    }
    expect(countItemOrderChanges(withTwoIds, swapped)).toBe(1)
    expect(countItemOrderChanges(withTwoIds, withTwoIds)).toBe(0)
  })

  it('qeAllowedStrategies: flexible solo sin franjas', () => {
    const withSlots = draftToEditState(makeTemplateDraft(), {}, {})
    expect(qeAllowedStrategies(withSlots)).toEqual(['structured', 'hybrid'])

    const noSlots: QuickEditState = {
      ...withSlots,
      variants: withSlots.variants.map((variant) => ({ ...variant, slots: [] })),
    }
    expect(qeAllowedStrategies(noSlots)).toEqual(['structured', 'flexible', 'hybrid'])
  })
})

// T3.2b (modo plantilla): la vigencia no existe en esa superficie y el guardado tiene que
// poder reabrirse — el mismo par de barreras del servicio (strip de identidad + round trip).
describe('modo plantilla (T3.2b)', () => {
  it('draftToEditState SIN la opcion effectiveFrom deja meta sin la llave (la card no pinta vigencia)', () => {
    const state = draftToEditState(makeTemplateDraft(), {}, {})
    expect(state.meta).toBeDefined()
    expect('effectiveFrom' in (state.meta ?? {})).toBe(false)

    // Con la opcion explicita (modos de creacion) la llave sigue existiendo, null = hoy.
    const creation = draftToEditState(makeTemplateDraft(), {}, { effectiveFrom: null })
    expect(creation.meta?.effectiveFrom).toBeNull()
  })

  it('con ids sinteticos, una plantilla intacta cuenta 0 cambios (los contadores aparean por id)', () => {
    // Sin ids (stripDraftIdentity los quito al guardar) cada fila contaria contra si misma
    // como baja+alta y el editor abriria "con cambios" sobre una plantilla sin tocar.
    const draft = withSyntheticDraftIds(makeTemplateDraft())
    const state = draftToEditState(draft, { foodsById: { [FOOD_ID]: TEMPLATE_FOOD } }, {})
    const baseline = applyQuickEditToDraft(draft, state)
    const current = applyQuickEditToDraft(draft, state)
    expect(
      countDraftChanges(baseline, current) +
        countItemSubstitutionChanges(baseline, current) +
        countItemOrderChanges(baseline, current),
    ).toBe(0)
  })

  it('round trip editor → payload de plantilla: identidad fuera, contenido intacto y reabrible', () => {
    const draft = withSyntheticDraftIds(makeTemplateDraft())
    const state = draftToEditState(
      draft,
      { foodsById: { [FOOD_ID]: TEMPLATE_FOOD }, portionGroupsById: { [GROUP_ID]: PORTION_GROUP } },
      {},
    )
    const projected = applyQuickEditToDraft(draft, state)

    const payload = buildTemplatePayload({ draft: projected })
    const reopened = parseTemplatePayload(payload)
    expect(reopened).not.toBeNull()

    const saved = reopened!.draft
    // El relleno de clientId y la vigencia JAMAS quedan en la fila.
    expect('clientId' in saved).toBe(false)
    expect('effectiveFrom' in saved).toBe(false)
    // Contenido: items (catalogo y libre), porciones y nombre sobreviven el viaje.
    expect(saved.name).toBe(draft.name)
    expect(saved.dayVariants).toHaveLength(draft.dayVariants.length)
    const slot = saved.dayVariants[0]!.mealSlots[0]!
    expect(slot.items.map((item) => item.foodId ?? item.customName)).toEqual([
      FOOD_ID,
      'Ensalada libre',
    ])
    expect((slot.exchangeTargets ?? []).map((target) => target.portions)).toEqual([2, 1])
  })
})
