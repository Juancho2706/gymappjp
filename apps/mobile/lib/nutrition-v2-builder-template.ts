/**
 * Plantillas de plan V2 -> estado del wizard RN (F4, "aplicar plantilla desde el builder movil").
 *
 * Espejo 1:1 de las dos ramas que ya resuelve la web en `builder/page.tsx:161-186`:
 *
 *  a. La plantilla nacio del wizard (guarda tambien su `builder`: `{state, portionsBySlot}`) ⇒ se
 *     abre EXACTA. `templateBuilderDraft` valida ese JSON client-controlled antes de tocar nada.
 *  b. La plantilla solo trae el `draft` del contrato (las 33 importadas de V1) ⇒
 *     `builderStateFromTemplateDraft` lo reconstruye, resolviendo sus alimentos contra el catalogo
 *     (que en RN llegan YA resueltos desde la API movil, porque no hay loader por ids en el cliente).
 *
 * PURO (sin react-native / expo / supabase): se testea directo. Espejo del web
 * `builder/_lib/rehydrate.ts:265-401`, con dos divergencias deliberadas:
 *   · `portionKeyOf` no es parametro — RN importa `portionsKey` igual que `nutrition-v2-builder-rehydrate`.
 *   · `effectiveFrom` se FUERZA a hoy tambien en la rama (a): el `builder` guardado conserva la
 *     fecha con la que se creo la plantilla, y heredarla publicaria una version con fecha vieja.
 */

import { householdRowShape } from '@eva/nutrition-v2'
import {
  BASE_VARIANT_LABEL,
  autoVariantLabel,
  createEmptyItem,
  migrateBuilderState,
  normalizeBuilderVariants,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
  type BuilderTargets,
  type BuilderUnit,
  type BuilderVariant,
} from './nutrition-v2-builder'
import { portionsKey, type PortionsBySlot } from './nutrition-v2-builder-portions'

export interface TemplateBuilderDraft {
  state: BuilderState
  portionsBySlot: PortionsBySlot
}

/** Numero del contrato -> texto del formulario ('' cuando la meta no esta definida). */
function targetText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value)
}

/** `08:00:00` -> `08:00`, que es lo que espera el input del wizard. */
function startTimeFromDraft(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim())
  return match ? `${match[1]}:${match[2]}` : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** Mapa de porciones de un payload persistido: descarta claves y targets que no cuadren. */
function normalizePortionsBySlot(raw: unknown): PortionsBySlot {
  if (!isRecord(raw)) return {}
  const out: PortionsBySlot = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue
    const targets = value
      .filter(isRecord)
      .filter(
        (target) =>
          typeof target.exchangeGroupId === 'string' &&
          typeof target.portions === 'number' &&
          Number.isFinite(target.portions),
      )
      .map((target) => ({
        exchangeGroupId: target.exchangeGroupId as string,
        portions: target.portions as number,
      }))
    if (targets.length > 0) out[key] = targets
  }
  return out
}

/**
 * Lee el `builder` guardado con la plantilla. `null` = no se puede usar (ausente, de otra forma o
 * sin dias), y el llamador cae al adaptador sobre el draft del contrato.
 *
 * El guard de "sin dias" va ANTES de `migrateBuilderState` a proposito: esa funcion normaliza un
 * `variants: []` a un dia base VACIO, asi que sin este corte una plantilla corrupta abriria el
 * wizard en blanco en vez de degradar al draft (espejo del `isUsableBuilderPayload` web).
 */
export function templateBuilderDraft(raw: unknown, today: string): TemplateBuilderDraft | null {
  if (!isRecord(raw)) return null
  const state = raw.state
  if (!isRecord(state) || !Array.isArray(state.variants) || state.variants.length === 0) return null
  const migrated = migrateBuilderState(state, today)
  if (migrated == null) return null
  return {
    // La plantilla NO tiene fecha de vigencia (el contrato se la quita): arranca hoy, como un
    // wizard en blanco. El paso 0 sigue siendo del coach.
    state: { ...migrated, step: 0, effectiveFrom: today },
    portionsBySlot: normalizePortionsBySlot(raw.portionsBySlot),
  }
}

/**
 * Forma minima del draft guardado (`NutritionPlanTemplateDraft`). Se declara estructural para no
 * acoplar este adaptador al schema exacto: el contrato ya lo valido server-side al abrirla.
 */
export interface TemplateDraftLike {
  name: string
  strategy: BuilderState['strategy']
  visibleNotes?: string | null
  permissions?: {
    canRegisterFreely?: boolean
    canAdjustPrescribedQuantity?: boolean
    canSubstitute?: boolean
  }
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
        /** Medida casera del item de la plantilla (W2): la emite `projectItem`. */
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
 * Convierte una plantilla en estado del wizard. `foods` son los alimentos ya resueltos (los trae la
 * API movil); un alimento que ya no existe degrada a item LIBRE con su nombre, en vez de
 * desaparecer sin avisar.
 *
 * Las claves de UI se generan aca (`t{v}-{s}`): el draft de la plantilla NO tiene ids de fila, asi
 * que ninguna clave suya puede hacer que el builder escriba sobre filas de otro plan.
 */
export function builderStateFromTemplateDraft(input: {
  draft: TemplateDraftLike
  foods?: Record<string, BuilderFood>
  /** Fecha de vigencia inicial (hoy en la zona del alumno): la plantilla no trae una. */
  clientTimezoneToday: string
}): TemplateBuilderDraft | null {
  const { draft, clientTimezoneToday } = input
  const foods = input.foods ?? {}
  if (!draft || (draft.dayVariants?.length ?? 0) === 0) return null

  const portionsBySlot: PortionsBySlot = {}
  const variants: BuilderVariant[] = draft.dayVariants.map((variant, variantIndex) => {
    const slots: BuilderSlot[] = (variant.mealSlots ?? []).map((slot, slotIndex) => {
      const slotKey = `t${variantIndex}-${slotIndex}`
      const targets = (slot.exchangeTargets ?? []).map((target) => ({
        exchangeGroupId: target.exchangeGroupId,
        portions: target.portions,
      }))
      if (targets.length > 0) portionsBySlot[portionsKey(variant.key, slotKey)] = targets
      return {
        key: slotKey,
        name: slot.name,
        startTime: startTimeFromDraft(slot.startTime ?? null),
        items: (slot.items ?? []).map((item, itemIndex) => {
          const baseFood = item.foodId ? foods[item.foodId] ?? null : null
          // W2: la plantilla puede traer un item YA en medida casera (`projectItem` la emite tal
          // cual). El par de la plantilla gana sobre el del catalogo, y si el alimento no se
          // resolvio la fila baja a gramos en vez de quedar en una unidad irresoluble.
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
          const builderItem: BuilderItem = {
            ...createEmptyItem(`${slotKey}-i${itemIndex}`),
            food,
            // Alimento borrado o fuera de scope: se conserva como item libre con su nombre.
            customName: food ? null : item.customName ?? 'Alimento',
            quantity: shown.quantity,
            unit: shown.unit as BuilderUnit,
            optional: item.optional ?? false,
            notes: item.notes ?? null,
          }
          return builderItem
        }),
      }
    })
    return {
      key: variant.key,
      label:
        variant.label.trim() === ''
          ? variant.default
            ? BASE_VARIANT_LABEL
            : autoVariantLabel(variant.dayOfWeek)
          : variant.label,
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
