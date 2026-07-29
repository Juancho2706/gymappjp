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

import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  BASE_VARIANT_LABEL,
  autoVariantLabel,
  createEmptyItem,
  normalizeBuilderVariants,
  toBuilderUnit,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
  type BuilderTargets,
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
  const food: BuilderFood | null = item.foodId
    ? catalogFood
      ? // El icono/categoria vienen resueltos en el read-model (mas frescos que el select de
        // `foods` del loader), asi que se prefieren cuando existen.
        { ...catalogFood, media: item.media ?? catalogFood.media, category: item.category ?? catalogFood.category }
      : foodFromSnapshot(item)
    : null

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
      },
    }))

  return {
    ...createEmptyItem(item.id),
    food,
    customName: food ? null : item.name,
    quantity: Number.isFinite(quantity) ? String(quantity) : '',
    unit: toBuilderUnit(item.unit),
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
