/**
 * Porciones a elección (T1.1) — lógica PURA del estado de porciones del builder web.
 * Sin React / Next / Supabase: solo el contrato del draft (@eva/nutrition-v2) y el
 * motor compartido (@eva/nutrition-engine).
 *
 * El estado de porciones vive FUERA del reducer del wizard (`_lib/draft-builder.ts`
 * es de la Ola 0 y no se toca): un mapa `slot.key -> targets` que se inyecta al
 * draft canónico justo antes de publicar (`attachPortionsAndValidate`). Claves de
 * franjas eliminadas quedan huérfanas en el mapa sin efecto: toda lectura filtra
 * por las franjas VIVAS del estado del wizard.
 *
 * Reglas de dominio (SPEC R1/R2): capa opcional SOLO sobre structured/hybrid (el
 * caller inyecta únicamente cuando la estrategia usa franjas — un plan flexible o
 * sin porciones produce un draft byte-idéntico al de hoy); pasos de 0,5, mínimo
 * 0,5, máximo 99 (espejo del CHECK y de NutritionExchangeTargetSchema).
 */

import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'
import {
  dayTotalsByVariant,
  formatPortions,
  macrosForTargets,
  type ExchangeGroup,
  type ExchangeMacroTotals,
} from '@eva/nutrition-engine'

/** Target de porciones de una franja en el wizard (pre-draft, sin notes en F1 web). */
export interface PortionTargetDraft {
  exchangeGroupId: string
  portions: number
}

/** Mapa `BuilderSlot.key -> targets de porciones` (estado hermano del wizard). */
export type PortionsBySlot = Record<string, PortionTargetDraft[]>

export const PORTIONS_STEP = 0.5
export const PORTIONS_MIN = 0.5
export const PORTIONS_MAX = 99

/** Ajusta al múltiplo de 0,5 más cercano dentro de [0,5; 99]. */
export function snapPortions(value: number): number {
  const snapped = Math.round(value * 2) / 2
  return Math.min(PORTIONS_MAX, Math.max(PORTIONS_MIN, snapped))
}

/**
 * Parsea la entrada libre del stepper ("1,5" o "1.5", es-CL admite coma decimal).
 * Devuelve el valor YA ajustado a paso/rango, o null si no es un número > 0.
 */
export function parsePortionsInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return snapPortions(n)
}

/** Formato es-CL con coma decimal para display: 1.5 -> "1,5" (engine intacto). */
export function formatPortionsEs(portions: number): string {
  return formatPortions(portions).replace('.', ',')
}

/**
 * Convierte decimales con punto a coma es-CL dentro de un label del engine
 * ("2C · 1.5V" -> "2C · 1,5V"). Solo toca dígito.dígito, nunca otros puntos.
 */
export function esDecimal(label: string): string {
  return label.replace(/(\d)\.(\d)/g, '$1,$2')
}

export function slotPortionTargets(map: PortionsBySlot, slotKey: string): PortionTargetDraft[] {
  return map[slotKey] ?? []
}

/** Agrega un grupo a la franja con 1 porción por defecto. No-op si ya está (UNIQUE por franja+grupo). */
export function addPortionGroup(map: PortionsBySlot, slotKey: string, exchangeGroupId: string): PortionsBySlot {
  const current = slotPortionTargets(map, slotKey)
  if (current.some((t) => t.exchangeGroupId === exchangeGroupId)) return map
  return { ...map, [slotKey]: [...current, { exchangeGroupId, portions: 1 }] }
}

export function removePortionGroup(map: PortionsBySlot, slotKey: string, exchangeGroupId: string): PortionsBySlot {
  const current = slotPortionTargets(map, slotKey)
  const next = current.filter((t) => t.exchangeGroupId !== exchangeGroupId)
  if (next.length === current.length) return map
  return { ...map, [slotKey]: next }
}

/** Fija el valor (ya parseado) de un grupo, ajustado a paso/rango. */
export function setPortionValue(
  map: PortionsBySlot,
  slotKey: string,
  exchangeGroupId: string,
  portions: number,
): PortionsBySlot {
  const value = snapPortions(portions)
  return {
    ...map,
    [slotKey]: slotPortionTargets(map, slotKey).map((t) =>
      t.exchangeGroupId === exchangeGroupId ? { ...t, portions: value } : t,
    ),
  }
}

/** Paso ±0,5 con clamp [0,5; 99]. */
export function stepPortionValue(
  map: PortionsBySlot,
  slotKey: string,
  exchangeGroupId: string,
  direction: 1 | -1,
): PortionsBySlot {
  const current = slotPortionTargets(map, slotKey).find((t) => t.exchangeGroupId === exchangeGroupId)
  if (!current) return map
  return setPortionValue(map, slotKey, exchangeGroupId, current.portions + direction * PORTIONS_STEP)
}

/** ¿Hay porciones en alguna franja VIVA? (las claves huérfanas de franjas borradas no cuentan). */
export function hasAnyPortions(map: PortionsBySlot, liveSlotKeys: string[]): boolean {
  return liveSlotKeys.some((key) => slotPortionTargets(map, key).some((t) => t.portions > 0))
}

/** Grupos para el picker: los 9 system PRIMERO (sortOrder, code), custom del coach después. */
export function sortGroupsForPicker(groups: ExchangeGroup[]): ExchangeGroup[] {
  return [...groups].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.code.localeCompare(b.code)
  })
}

/**
 * Totales de macros derivados de TODAS las porciones del plan (Σ porciones × ref del
 * grupo, expansión `composed_of` incluida) — `dayTotalsByVariant` del engine, misma
 * matemática que verá el alumno (paridad con los tests de exchange-calc, SPEC R6).
 */
export function derivePortionTotals(
  liveSlotKeys: string[],
  map: PortionsBySlot,
  groups: ExchangeGroup[],
): ExchangeMacroTotals {
  const meals = liveSlotKeys
    .map((key) => ({ targets: slotPortionTargets(map, key) }))
    .filter((meal) => meal.targets.length > 0)
  return dayTotalsByVariant(meals, [], groups)[0].totals
}

/**
 * Macros derivados de las porciones de UNA franja (Σ porciones × ref del grupo,
 * expansión `composed_of` incluida vía `macrosForTargets` — misma matemática del
 * alumno). Devuelve `null` cuando la franja no tiene porciones O el catálogo de
 * grupos aún no cargó: el subtotal de la franja muestra solo los items fijos
 * (jamás NaN). Fix QA F1-2: el subtotal de franja ignoraba las porciones.
 */
export function slotPortionTotals(
  map: PortionsBySlot,
  slotKey: string,
  groups: ExchangeGroup[] | null,
): ExchangeMacroTotals | null {
  if (groups == null) return null
  const targets = slotPortionTargets(map, slotKey).filter((t) => t.portions > 0)
  if (targets.length === 0) return null
  return macrosForTargets(targets, groups)
}

/** Forma mínima compartida con `ItemMacros` del builder (sin acoplarse a _lib). */
export interface SubtotalMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

/**
 * Subtotal combinado de la franja: items fijos + derivado de porciones. Sin
 * porciones (o catálogo sin cargar) devuelve EXACTAMENTE el objeto de items
 * (misma referencia: franja sin porciones se ve idéntica a antes). Redondeo a
 * 1 decimal, espejo de `addMacros` del builder.
 */
export function combineSubtotals<T extends SubtotalMacros>(
  items: T,
  portionTotals: ExchangeMacroTotals | null,
): T {
  if (portionTotals == null) return items
  const round1 = (n: number) => Math.round(n * 10) / 10
  return {
    ...items,
    calories: round1(items.calories + portionTotals.calories),
    proteinG: round1(items.proteinG + portionTotals.proteinG),
    carbsG: round1(items.carbsG + portionTotals.carbsG),
    fatsG: round1(items.fatsG + portionTotals.fatsG),
  }
}

/**
 * Inyecta los targets de porciones al draft YA ensamblado/validado por el wizard y
 * re-valida contra el contrato. Los mealSlots del draft están alineados por índice
 * con `slotKeys` (assembleDraft los emite en el orden de state.slots). Franjas sin
 * porciones quedan EXACTAMENTE iguales (sin la clave `exchangeTargets`): un plan sin
 * porciones produce un draft byte-idéntico al de hoy (SPEC R1 / criterio Q1).
 */
export function attachPortionsAndValidate(
  draft: NutritionPlanDraft,
  slotKeys: string[],
  map: PortionsBySlot,
): NutritionPlanDraft {
  if (!hasAnyPortions(map, slotKeys)) return draft
  const withPortions: NutritionPlanDraft = {
    ...draft,
    dayVariants: draft.dayVariants.map((variant) => ({
      ...variant,
      mealSlots: variant.mealSlots.map((slot, index) => {
        const key = slotKeys[index]
        const targets = key == null ? [] : slotPortionTargets(map, key).filter((t) => t.portions > 0)
        if (targets.length === 0) return slot
        return {
          ...slot,
          exchangeTargets: targets.map((t, orderIndex) => ({
            exchangeGroupId: t.exchangeGroupId,
            portions: t.portions,
            notes: null,
            orderIndex,
          })),
        }
      }),
    })),
  }
  return NutritionPlanDraftSchema.parse(withPortions)
}
