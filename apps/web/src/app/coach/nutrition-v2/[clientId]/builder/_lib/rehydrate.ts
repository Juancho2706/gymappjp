/**
 * Rehidratacion del wizard desde el plan vigente (multi-dia, FD1c).
 *
 * "Rehacer con el asistente" abria el wizard EN BLANCO: publicar desde ahi reescribia el
 * arbol completo y borraba en silencio los dias, franjas, items, reemplazos y porciones que
 * el plan ya tenia (por eso existia el guard anti-colapso). Este modulo hace lo contrario:
 * convierte el read-model del plan vigente en el `BuilderState` + el mapa de porciones que
 * el wizard sabe editar, de modo que abrirlo y publicar sin tocar nada produzca el MISMO
 * plan (N dias y notas visibles del alumno incluidos).
 *
 * PURO (sin React / Next / Supabase): recibe el read-model, los alimentos ya resueltos
 * server-side (`foods`, RLS-scoped) y el mapa de reemplazos congelados. Se testea directo.
 */

import { householdRowShape } from '@eva/nutrition-v2'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  BASE_VARIANT_LABEL,
  autoVariantLabel,
  createEmptyItem,
  normalizeBuilderVariants,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
  type BuilderTargets,
  type BuilderUnit,
  type BuilderVariant,
} from './draft-builder'

type ReadDayVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadMealSlot = ReadDayVariant['mealSlots'][number]
type ReadPrescriptionItem = ReadMealSlot['prescriptionItems'][number]

/** Mapa de porciones del wizard (forma estructural de `PortionsBySlot`, sin acoplar _components). */
export type RehydratedPortionsBySlot = Record<string, Array<{ exchangeGroupId: string; portions: number }>>

export interface RehydratedBuilderDraft {
  state: BuilderState
  portionsBySlot: RehydratedPortionsBySlot
}

/** Numero del read-model -> texto del formulario ('' cuando la meta no esta definida). */
function targetText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value)
}

function targetsFromRead(targets: ReadDayVariant['targets']): BuilderTargets {
  return {
    calories: targetText(targets.calories),
    proteinG: targetText(targets.proteinG),
    carbsG: targetText(targets.carbsG),
    fatsG: targetText(targets.fatsG),
  }
}

function sameTargets(a: BuilderTargets, b: BuilderTargets): boolean {
  return (
    a.calories === b.calories && a.proteinG === b.proteinG && a.carbsG === b.carbsG && a.fatsG === b.fatsG
  )
}

/** `08:00:00` (columna `time`) -> `08:00`, que es lo que espera el input del wizard. */
function startTimeFromRead(value: string | null): string {
  if (typeof value !== 'string') return ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim())
  return match ? `${match[1]}:${match[2]}` : ''
}

/**
 * Alimento reconstruido desde el SNAPSHOT congelado cuando la fila de `foods` ya no se puede
 * leer (borrada, fuera del scope RLS). Conserva `foodId` y reproduce exactamente las macros
 * prescritas: con `servingSize = 100`, `computeItemMacros` devuelve el snapshot tanto en g/ml
 * (factor `quantity/100`) como en unidades (factor `quantity*100/100`). Nunca se pierde el item.
 */
function foodFromSnapshot(item: ReadPrescriptionItem): BuilderFood {
  const quantity = Number(item.quantity)
  const direct = item.unit === 'g' || item.unit === 'ml'
  const per100 = (value: number | null): number => {
    if (value == null || !Number.isFinite(value) || !Number.isFinite(quantity) || quantity <= 0) return 0
    return direct ? (value * 100) / quantity : value / quantity
  }
  return {
    id: item.foodId as string,
    name: item.name ?? 'Alimento',
    brand: item.brand,
    calories: per100(item.macros.calories),
    proteinG: per100(item.macros.proteinG),
    carbsG: per100(item.macros.carbsG),
    fatsG: per100(item.macros.fatsG),
    fiberG: item.macros.fiberG == null ? null : per100(item.macros.fiberG),
    servingSize: 100,
    servingUnit: item.unit,
    category: item.category ?? null,
    media: item.media ?? null,
    // Medida casera CONGELADA en el ítem (W2): sin catálogo que leer, la del ítem es la única
    // verdad que queda — y es la que hay que re-emitir al republicar para no perder el rótulo.
    householdGrams: item.householdGrams ?? null,
    householdLabel: item.householdLabel ?? null,
  }
}

/** Macros POR 100 de un item libre, invertidas desde el snapshot de la cantidad prescrita. */
function customMacroText(value: number | null, quantity: number): string {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(quantity) || quantity <= 0) return ''
  const per100 = Math.round(((value * 100) / quantity) * 10) / 10
  return String(per100)
}

function itemFromRead(
  item: ReadPrescriptionItem,
  foods: Record<string, BuilderFood>,
  substitutionsByItemId: Record<string, NutritionItemSubstitutionRead[]>,
): BuilderItem {
  const quantity = Number(item.quantity)
  const catalogFood = item.foodId ? foods[item.foodId] ?? null : null
  const baseFood: BuilderFood | null = item.foodId
    ? catalogFood
      ? // El icono/categoria vienen resueltos en el read-model (mas frescos que el select de
        // `foods` del loader), asi que se prefieren cuando existen.
        { ...catalogFood, media: item.media ?? catalogFood.media, category: item.category ?? catalogFood.category }
      : foodFromSnapshot(item)
    : null
  /**
   * Medida casera CONGELADA en el ítem (W2 «Cantidades honestas»). Gana sobre la del catálogo
   * vigente: el plan dice «2 huevos de 61 g» y eso no se mueve porque alguien editó el alimento.
   * Sin esto, republicar desde el asistente perdía el rótulo (el agujero que describe R2).
   */
  const shown = householdRowShape({
    unit: item.unit,
    quantity,
    householdGrams: item.householdGrams,
    householdLabel: item.householdLabel,
    servingUnit: baseFood?.servingUnit ?? item.unit,
    hasFood: baseFood !== null,
  })
  const food: BuilderFood | null =
    baseFood && shown.pair !== null
      ? { ...baseFood, householdGrams: shown.pair.grams, householdLabel: shown.pair.label }
      : baseFood

  const subs = (substitutionsByItemId[item.id] ?? [])
    // El builder solo sabe representar reemplazos de CATALOGO (chip con alimento). Un
    // reemplazo sin `foodId` (imposible desde estas superficies) se omite en vez de romper.
    .filter((sub) => sub.foodId != null)
    .map((sub) => ({
      key: sub.id,
      food: foods[sub.foodId as string] ?? {
        id: sub.foodId as string,
        name: sub.name,
        brand: sub.brand,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatsG: 0,
        fiberG: null,
        servingSize: 100,
        servingUnit: sub.unit ?? 'g',
        category: null,
        media: null,
        // Un reemplazo sin catálogo no tiene medida casera que ofrecer (ni la necesita: la
        // equivalencia del reemplazo se resuelve por kcal, nunca por unidad).
        householdGrams: null,
        householdLabel: null,
      },
    }))

  return {
    ...createEmptyItem(item.id),
    food,
    customName: food ? null : item.name,
    quantity: shown.quantity,
    unit: shown.unit as BuilderUnit,
    optional: item.optional,
    notes: item.notes,
    customCalories: food ? '' : customMacroText(item.macros.calories, quantity),
    customProteinG: food ? '' : customMacroText(item.macros.proteinG, quantity),
    customCarbsG: food ? '' : customMacroText(item.macros.carbsG, quantity),
    customFatsG: food ? '' : customMacroText(item.macros.fatsG, quantity),
    substitutions: subs,
  }
}

function slotFromRead(
  slot: ReadMealSlot,
  foods: Record<string, BuilderFood>,
  substitutionsByItemId: Record<string, NutritionItemSubstitutionRead[]>,
): BuilderSlot {
  return {
    key: slot.id,
    name: slot.name,
    startTime: startTimeFromRead(slot.startTime),
    items: slot.prescriptionItems.map((item) => itemFromRead(item, foods, substitutionsByItemId)),
  }
}

/**
 * Rehidrata el wizard desde el plan vigente. Devuelve `null` si el alumno no tiene plan
 * (nada que rehidratar: el wizard arranca vacio, como siempre).
 *
 * `portionKeyOf` construye la clave del mapa de porciones (`variantKey` + `slotKey`) para no
 * duplicar aqui el formato que define `portions-state`.
 */
export function rehydrateBuilderState(input: {
  planModel: NutritionPlanReadModel
  /** Alimentos del plan resueltos server-side, por `foodId`. */
  foods: Record<string, BuilderFood>
  /** Reemplazos congelados de la version vigente, agrupados por `prescriptionItemId`. */
  substitutionsByItemId: Record<string, NutritionItemSubstitutionRead[]>
  /** Fecha de vigencia inicial de la version nueva (hoy en la zona del alumno). */
  effectiveFrom: string
  portionKeyOf: (variantKey: string, slotKey: string) => string
}): RehydratedBuilderDraft | null {
  const { planModel, foods, substitutionsByItemId, effectiveFrom, portionKeyOf } = input
  const plan = planModel.plan
  if (!plan || planModel.dayVariants.length === 0) return null

  const baseRead = planModel.dayVariants.find((variant) => variant.isDefault) ?? planModel.dayVariants[0]
  const baseTargets = targetsFromRead(baseRead.targets)

  const portionsBySlot: RehydratedPortionsBySlot = {}
  const variants: BuilderVariant[] = planModel.dayVariants.map((variant) => {
    const ownTargets = targetsFromRead(variant.targets)
    for (const slot of variant.mealSlots) {
      const targets = (slot.exchangeTargets ?? []).map((target) => ({
        exchangeGroupId: target.exchangeGroupId,
        portions: target.portions,
      }))
      if (targets.length > 0) portionsBySlot[portionKeyOf(variant.key, slot.id)] = targets
    }
    return {
      key: variant.key,
      label: variant.label.trim() === '' ? (variant.isDefault ? BASE_VARIANT_LABEL : autoVariantLabel(variant.dayOfWeek)) : variant.label,
      dayOfWeek: variant.dayOfWeek,
      isDefault: variant.isDefault,
      // Herencia: un dia especifico con las MISMAS metas del base se rehidrata como
      // "hereda" (asi el banner ofrece personalizar y editar el base propaga al dia).
      targetsMode: variant.isDefault || sameTargets(ownTargets, baseTargets) ? 'inherit' : 'custom',
      targets: ownTargets,
      slots: variant.mealSlots.map((slot) => slotFromRead(slot, foods, substitutionsByItemId)),
    }
  })

  const normalized = normalizeBuilderVariants(variants)
  const base = normalized.find((variant) => variant.isDefault) ?? normalized[0]

  return {
    state: {
      step: 0,
      strategy: plan.strategy,
      planName: plan.name,
      effectiveFrom,
      targets: baseTargets,
      permissions: {
        canRegisterFreely: planModel.permissions.canRegisterFreely,
        canAdjustPrescribedQuantity: planModel.permissions.canAdjustPrescribedQuantity,
        canSubstitute: planModel.permissions.canSubstitute,
      },
      // Notas visibles del alumno: el wizard no tiene campo para editarlas (se escriben en la
      // edicion rapida), pero publicar reescribe la version COMPLETA, asi que sin traerlas aqui
      // "Rehacer con el asistente" las borraba en silencio. `protocolNotes` NO se rehidrata: es
      // capacidad Pro y `publishPlanAction` la repone desde la version base, para que el gate del
      // addon no lea como "nueva" una nota que el plan ya tenia (ver `assembleDraft`).
      visibleNotes: planModel.visibleNotes,
      variants: normalized,
      activeVariantKey: base.key,
    },
    portionsBySlot,
  }
}

/** Ids de alimentos referenciados por el plan (items + reemplazos), para resolverlos de una. */
export function collectPlanFoodIds(
  planModel: NutritionPlanReadModel,
  substitutions: readonly NutritionItemSubstitutionRead[],
): string[] {
  const ids = new Set<string>()
  for (const variant of planModel.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.prescriptionItems) {
        if (item.foodId) ids.add(item.foodId)
      }
    }
  }
  for (const sub of substitutions) {
    if (sub.foodId) ids.add(sub.foodId)
  }
  return [...ids]
}

// ─── Plantillas (F3) ────────────────────────────────────────────────────────────
//
// Una plantilla guarda el DRAFT del contrato (`NutritionPlanTemplateDraft`), que es lo unico
// compartible con RN. Cuando la plantilla nace del wizard web tambien guarda el `BuilderState`
// exacto y esta funcion no hace falta; se usa para las plantillas IMPORTADAS de V1, cuyos items
// siempre referencian un alimento del catalogo.
//
// Las claves de UI se generan aqui (`t{v}-{s}`): `assembleDraft` NO emite ids de fila — solo
// `key` —, asi que ninguna clave de una plantilla puede hacer que el builder escriba sobre
// filas de otro plan.

type TemplateDraftLike = {
  name: string
  strategy: BuilderState['strategy']
  visibleNotes?: string | null
  permissions?: { canRegisterFreely?: boolean; canAdjustPrescribedQuantity?: boolean; canSubstitute?: boolean }
  dayVariants: Array<{
    key: string
    label: string
    dayOfWeek: number | null
    default?: boolean
    targets?: { calories?: number | null; proteinG?: number | null; carbsG?: number | null; fatsG?: number | null }
    mealSlots?: Array<{
      name: string
      startTime?: string | null
      items?: Array<{
        foodId?: string | null
        customName?: string | null
        quantity: number
        unit: string
        optional?: boolean
        notes?: string | null
        /** Medida casera del ítem de la plantilla (W2): la emite `projectItem`. */
        householdLabel?: string | null
        householdGrams?: number | null
      }>
      exchangeTargets?: Array<{ exchangeGroupId: string; portions: number }>
    }>
  }>
}

function targetsFromDraft(targets: TemplateDraftLike['dayVariants'][number]['targets']): BuilderTargets {
  return {
    calories: targetText(targets?.calories),
    proteinG: targetText(targets?.proteinG),
    carbsG: targetText(targets?.carbsG),
    fatsG: targetText(targets?.fatsG),
  }
}

/**
 * Convierte una plantilla en estado del wizard. `foods` son los alimentos ya resueltos
 * server-side por id; un alimento que ya no existe degrada a item LIBRE con su nombre, en vez
 * de desaparecer sin avisar.
 */
export function builderStateFromTemplateDraft(input: {
  draft: TemplateDraftLike
  foods: Record<string, BuilderFood>
  clientTimezoneToday: string
  portionKeyOf: (variantKey: string, slotKey: string) => string
}): RehydratedBuilderDraft | null {
  const { draft, foods, clientTimezoneToday, portionKeyOf } = input
  if (!draft || (draft.dayVariants?.length ?? 0) === 0) return null

  const portionsBySlot: RehydratedPortionsBySlot = {}
  const variants: BuilderVariant[] = draft.dayVariants.map((variant, variantIndex) => {
    const slots: BuilderSlot[] = (variant.mealSlots ?? []).map((slot, slotIndex) => {
      const slotKey = `t${variantIndex}-${slotIndex}`
      const targets = (slot.exchangeTargets ?? []).map((target) => ({
        exchangeGroupId: target.exchangeGroupId,
        portions: target.portions,
      }))
      if (targets.length > 0) portionsBySlot[portionKeyOf(variant.key, slotKey)] = targets
      return {
        key: slotKey,
        name: slot.name,
        startTime: startTimeFromRead(slot.startTime ?? null),
        items: (slot.items ?? []).map((item, itemIndex) => {
          const baseFood = item.foodId ? foods[item.foodId] ?? null : null
          // W2: la plantilla puede traer un ítem YA en medida casera (`projectItem` la emite tal
          // cual). El par de la plantilla gana sobre el del catálogo, y si el alimento no se
          // resolvió la fila baja a gramos en vez de quedar en una unidad irresoluble.
          const shown = householdRowShape({
            unit: item.unit,
            quantity: item.quantity,
            householdGrams: item.householdGrams,
            householdLabel: item.householdLabel,
            servingUnit: baseFood?.servingUnit ?? item.unit,
            hasFood: baseFood !== null,
          })
          const food =
            baseFood && shown.pair !== null
              ? { ...baseFood, householdGrams: shown.pair.grams, householdLabel: shown.pair.label }
              : baseFood
          return {
            ...createEmptyItem(`${slotKey}-i${itemIndex}`),
            food,
            // Alimento borrado o fuera de scope: se conserva como item libre con su nombre.
            customName: food ? null : item.customName ?? 'Alimento',
            quantity: shown.quantity,
            unit: shown.unit as BuilderUnit,
            optional: item.optional ?? false,
            notes: item.notes ?? null,
          } satisfies BuilderItem
        }),
      }
    })
    return {
      key: variant.key,
      label: variant.label.trim() === '' ? (variant.default ? BASE_VARIANT_LABEL : autoVariantLabel(variant.dayOfWeek)) : variant.label,
      dayOfWeek: variant.default ? null : variant.dayOfWeek,
      isDefault: variant.default === true,
      targetsMode: variant.default ? 'inherit' : 'custom',
      targets: targetsFromDraft(variant.targets),
      slots,
    }
  })

  const normalized = normalizeBuilderVariants(variants)
  const base = normalized.find((variant) => variant.isDefault) ?? normalized[0]
  const baseSource = draft.dayVariants.find((variant) => variant.default) ?? draft.dayVariants[0]

  return {
    state: {
      step: 0,
      strategy: draft.strategy,
      planName: draft.name,
      // La plantilla NO trae fecha de vigencia: arranca hoy, como un wizard en blanco.
      effectiveFrom: clientTimezoneToday,
      targets: targetsFromDraft(baseSource?.targets),
      permissions: {
        canRegisterFreely: draft.permissions?.canRegisterFreely ?? false,
        canAdjustPrescribedQuantity: draft.permissions?.canAdjustPrescribedQuantity ?? false,
        canSubstitute: draft.permissions?.canSubstitute ?? false,
      },
      visibleNotes: draft.visibleNotes ?? null,
      variants: normalized,
      activeVariantKey: base.key,
    },
    portionsBySlot,
  }
}

// `collectTemplateFoodIds` se mudo a `@eva/nutrition-v2` (retiro del par viejo): lo usan el
// editor, el de plantillas y el endpoint movil, ninguno de los cuales deberia importar del
// wizard. Se re-exporta para los importadores historicos.
export { collectTemplateFoodIds } from '@eva/nutrition-v2'
