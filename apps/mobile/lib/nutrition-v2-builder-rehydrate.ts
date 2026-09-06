/**
 * Rehidratacion del wizard RN desde el plan vigente (multi-dia, FD4).
 *
 * "Rehacer con el asistente" abria el constructor movil EN BLANCO y con un guard que bloqueaba
 * los planes de mas de un dia: publicar desde ahi reescribia el arbol completo y borraba en
 * silencio dias, franjas, items, reemplazos y porciones. Este modulo hace lo contrario:
 * convierte el read-model del plan vigente en el `BuilderState` + el mapa de porciones que el
 * wizard sabe editar, de modo que abrirlo y publicar sin tocar nada produzca el MISMO plan
 * (N dias incluidos).
 *
 * PURO (sin react-native / expo): recibe el read-model, los alimentos ya resueltos (opcional) y
 * el mapa de reemplazos congelados. Espejo 1:1 de la web
 * `apps/web/.../builder/_lib/rehydrate.ts`; la unica divergencia es que en RN NO hay loader de
 * `foods` server-side, asi que `foods` suele llegar vacio y todo item de catalogo se reconstruye
 * desde su SNAPSHOT congelado (`foodFromSnapshot`), que reproduce exactamente las macros
 * prescritas. El loader de reemplazos vive abajo (lectura RLS-scoped, igual que el quick-edit).
 */

import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  householdRowShape,
  mapNutritionItemSubstitutionRow,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
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
  type NutritionV2WriteClient,
} from './nutrition-v2-builder'
import { portionsKey, type PortionsBySlot } from './nutrition-v2-builder-portions'

type ReadDayVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadMealSlot = ReadDayVariant['mealSlots'][number]
type ReadPrescriptionItem = ReadMealSlot['prescriptionItems'][number]

export interface RehydratedBuilderDraft {
  state: BuilderState
  portionsBySlot: PortionsBySlot
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
  return a.calories === b.calories && a.proteinG === b.proteinG && a.carbsG === b.carbsG && a.fatsG === b.fatsG
}

/** `08:00:00` (columna `time`) -> `08:00`, que es lo que espera el input del wizard. */
function startTimeFromRead(value: string | null): string {
  if (typeof value !== 'string') return ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim())
  return match ? `${match[1]}:${match[2]}` : ''
}

/**
 * Alimento reconstruido desde el SNAPSHOT congelado cuando la fila de `foods` no se resolvio
 * (en RN es el caso NORMAL: no hay loader de catalogo al abrir el wizard). Conserva `foodId` y
 * reproduce exactamente las macros prescritas: con `servingSize = 100`, `computeItemMacros`
 * devuelve el snapshot tanto en g/ml (factor `quantity/100`) como en unidades (factor
 * `quantity*100/100`). Nunca se pierde el item.
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
    // Medida casera CONGELADA en el item (W2): sin catalogo que leer, la del item es la unica
    // verdad que queda — y es la que hay que re-emitir al republicar para no perder el rotulo.
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
      ? // El icono/categoria vienen resueltos en el read-model (mas frescos que un select de
        // `foods`), asi que se prefieren cuando existen.
        { ...catalogFood, media: item.media ?? catalogFood.media, category: item.category ?? catalogFood.category }
      : foodFromSnapshot(item)
    : null
  // La medida casera CONGELADA gana sobre la del catalogo vigente (W2): el plan dice «2 huevos
  // de 61 g» y eso no se mueve porque alguien haya editado el alimento despues. Sin esto,
  // republicar desde el asistente RN borraba el rotulo (el agujero que describe R2).
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
    // El builder solo sabe representar reemplazos de CATALOGO (chip con alimento). Un reemplazo
    // sin `foodId` (imposible desde estas superficies) se omite en vez de romper.
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
        // Un reemplazo sin catalogo no tiene medida casera que ofrecer (ni la necesita: la
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
 * Rehidrata el wizard desde el plan vigente. Devuelve `null` si el alumno no tiene plan (nada
 * que rehidratar: el wizard arranca vacio, como siempre).
 */
export function rehydrateBuilderState(input: {
  planModel: NutritionPlanReadModel
  /** Alimentos del plan ya resueltos, por `foodId`. En RN suele ir vacio (ver `foodFromSnapshot`). */
  foods?: Record<string, BuilderFood>
  /** Reemplazos congelados de la version vigente, agrupados por `prescriptionItemId`. */
  substitutionsByItemId?: Record<string, NutritionItemSubstitutionRead[]>
  /** Fecha de vigencia inicial de la version nueva (hoy en la zona del alumno). */
  effectiveFrom: string
}): RehydratedBuilderDraft | null {
  const planModel = input.planModel
  const foods = input.foods ?? {}
  const substitutionsByItemId = input.substitutionsByItemId ?? {}
  const plan = planModel.plan
  if (!plan || planModel.dayVariants.length === 0) return null

  const baseRead = planModel.dayVariants.find((variant) => variant.isDefault) ?? planModel.dayVariants[0]
  const baseTargets = targetsFromRead(baseRead.targets)

  const portionsBySlot: PortionsBySlot = {}
  const variants: BuilderVariant[] = planModel.dayVariants.map((variant) => {
    const ownTargets = targetsFromRead(variant.targets)
    for (const slot of variant.mealSlots) {
      const targets = (slot.exchangeTargets ?? []).map((target) => ({
        exchangeGroupId: target.exchangeGroupId,
        portions: target.portions,
      }))
      if (targets.length > 0) portionsBySlot[portionsKey(variant.key, slot.id)] = targets
    }
    return {
      key: variant.key,
      label:
        variant.label.trim() === ''
          ? variant.isDefault
            ? BASE_VARIANT_LABEL
            : autoVariantLabel(variant.dayOfWeek)
          : variant.label,
      dayOfWeek: variant.dayOfWeek,
      isDefault: variant.isDefault,
      // Herencia: un dia especifico con las MISMAS metas del base se rehidrata como "hereda"
      // (asi el banner ofrece personalizar y editar el base propaga al dia).
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
      effectiveFrom: input.effectiveFrom,
      targets: baseTargets,
      permissions: {
        canRegisterFreely: planModel.permissions.canRegisterFreely,
        canAdjustPrescribedQuantity: planModel.permissions.canAdjustPrescribedQuantity,
        canSubstitute: planModel.permissions.canSubstitute,
      },
      // Notas visibles del alumno: el wizard no tiene campo para editarlas (se escriben en la
      // edicion rapida), pero publicar reescribe la version COMPLETA, asi que sin traerlas aqui
      // "Rehacer con el asistente" las borraba en silencio. `protocolNotes` NO se rehidrata: es
      // capacidad Pro y el endpoint movil la repone desde la version base, para que el gate del
      // addon no lea como "nueva" una nota que el plan ya tenia (ver `assembleDraft`).
      visibleNotes: planModel.visibleNotes,
      variants: normalized,
      activeVariantKey: base.key,
    },
    portionsBySlot,
  }
}

/**
 * Reemplazos autorizados de la version vigente agrupados por `prescriptionItemId`, en la forma
 * de LECTURA (`NutritionItemSubstitutionRead`) que consume `rehydrateBuilderState`.
 *
 * El resultado es DISCRIMINADO a proposito (misma leccion NUT-008 del quick-edit): un fallo de
 * lectura NO puede degradarse a mapa vacio, porque publicar reescribe el arbol COMPLETO y
 * rehidratar sin reemplazos los BORRARIA. `status: 'error'` obliga al llamador a no rehidratar
 * (y caer al guard); un plan sin reemplazos es `status: 'loaded'` con el mapa vacio.
 */
export async function loadBuilderSubstitutionsForVersion(
  db: NutritionV2WriteClient,
  versionId: string,
): Promise<{ status: 'loaded' | 'error'; byItemId: Record<string, NutritionItemSubstitutionRead[]> }> {
  const byItemId: Record<string, NutritionItemSubstitutionRead[]> = {}
  try {
    const res = await db
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .eq('version_id', versionId)
      .order('order_index', { ascending: true })
    if (res.error || !res.data) return { status: 'error', byItemId: {} }
    const rows = res.data as Parameters<typeof mapNutritionItemSubstitutionRow>[0][]
    for (const row of rows) {
      const mapped = mapNutritionItemSubstitutionRow(row)
      const bucket = byItemId[mapped.prescriptionItemId] ?? []
      bucket.push(mapped)
      byItemId[mapped.prescriptionItemId] = bucket
    }
  } catch {
    return { status: 'error', byItemId: {} }
  }
  return { status: 'loaded', byItemId }
}
