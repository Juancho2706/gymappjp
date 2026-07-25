/**
 * Porciones a elección (4B-11) — lógica PURA del estado de porciones del BUILDER RN.
 * Sin react-native / expo: solo el motor compartido (@eva/nutrition-engine) y los tipos
 * de persistencia congelada del quick-edit (import de SOLO tipos, sin runtime).
 *
 * Port 1:1 de la web
 * `apps/web/.../builder/_components/portions-state.ts:28-228` (afirmación 1 de la spec):
 * el estado de porciones vive FUERA del reducer del wizard (`nutrition-v2-builder.ts`, no
 * se toca su forma): un mapa `slot.key -> targets` que se inyecta al draft canónico justo
 * antes de publicar (en `assembleDraft`). Las claves de franjas eliminadas quedan huérfanas
 * en el mapa sin efecto: toda lectura filtra por las franjas VIVAS del estado del wizard.
 *
 * Diferencia con el quick-edit RN (`components/nutrition-v2/quick-edit/portions-state.ts`):
 * aquel estado se HIDRATA del read model (targets congelados con notes) y su catálogo son
 * SOLO los grupos que el plan ya usa; aquí el estado es pre-draft (mapa `PortionsBySlot`,
 * SIN notes en F1) y el catálogo es el COMPLETO del coach (system + propios). Por eso el
 * estado del quick-edit NO se recicla; sí se reusan sus PIEZAS DE PERSISTENCIA
 * (`buildPortionTargetInsertRows`, ver `buildFrozenPortionGroups` abajo).
 *
 * Reglas de dominio (SPEC R1/R2): capa opcional SOLO sobre structured/hybrid (el caller
 * inyecta únicamente cuando la estrategia usa franjas — un plan flexible o sin porciones
 * produce un draft byte-idéntico al de hoy); pasos de 0,5, mínimo 0,5, máximo 99 (espejo
 * del CHECK y de `NutritionExchangeTargetSchema`).
 */

import {
  dayTotalsByVariant,
  formatPortions,
  macrosForTargets,
  type ExchangeGroup,
  type ExchangeMacroTotals,
} from '@eva/nutrition-engine'
// SOLO tipos (se borran en runtime): reusamos las piezas de persistencia congelada del
// quick-edit sin duplicarlas (afirmación 8). El dict que consume `buildPortionTargetInsertRows`
// se arma con `buildFrozenPortionGroups`, enriqueciendo `composed_of` con el ref de cada base.
import type { PortionComposedPart, QuickEditPortionGroup } from './nutrition-v2-quick-edit'

/** Target de porciones de una franja en el wizard (pre-draft, sin notes en F1). */
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

/** Grupos para el picker: los system PRIMERO (sortOrder, code), custom del coach después. */
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

/** Forma mínima compartida con `ItemMacros` del builder (sin acoplarse a la lib). */
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
 * Resuelve un grupo base por código priorizando system (espejo de `findByCode` del
 * engine): al enriquecer `composed_of` (LEG -> P + C) cada base debe congelar su ref.
 */
function findGroupByCode(groups: ExchangeGroup[], code: string): ExchangeGroup | undefined {
  const candidates = groups.filter((g) => g.code === code)
  return candidates.find((g) => g.isSystem) ?? candidates[0]
}

/**
 * Dict `exchangeGroupId -> QuickEditPortionGroup` congelado DESDE el catálogo del coach,
 * para alimentar `buildPortionTargetInsertRows` (afirmación 8): el builder RN es el
 * escritor client-side (PostgREST), así que congela el snapshot por valor desde el
 * `ExchangeGroup[]` ya cargado — nunca desde la BD viva. `composed_of` va ENRIQUECIDO
 * (SPEC R2/A2): cada parte base lleva sus `ref_*` congelados al emitir, resolviendo la
 * base por código. Si una parte base no resuelve, el grupo se OMITE del dict: así
 * `buildPortionTargetInsertRows` devuelve `null` y el publish corta en voz alta (jamás
 * una fila con snapshot NULL). Espejo del freeze server-side del web.
 */
export function buildFrozenPortionGroups(groups: ExchangeGroup[]): Map<string, QuickEditPortionGroup> {
  const dict = new Map<string, QuickEditPortionGroup>()
  for (const group of groups) {
    let composedOf: PortionComposedPart[] | null = null
    if (group.composedOf != null) {
      const enriched: PortionComposedPart[] = []
      let resolvable = true
      for (const part of group.composedOf) {
        const base = findGroupByCode(groups, part.code)
        if (!base) {
          resolvable = false
          break
        }
        enriched.push({
          code: part.code,
          portions: part.portions,
          ref: {
            calories: base.refCalories,
            proteinG: base.refProteinG,
            carbsG: base.refCarbsG,
            fatsG: base.refFatsG,
          },
        })
      }
      if (!resolvable) continue
      composedOf = enriched
    }
    dict.set(group.id, {
      exchangeGroupId: group.id,
      groupCode: group.code,
      groupName: group.name,
      color: group.color,
      ref: {
        calories: group.refCalories,
        proteinG: group.refProteinG,
        carbsG: group.refCarbsG,
        fatsG: group.refFatsG,
      },
      composedOf,
      macrosConfirmed: group.macrosConfirmed,
      sortOrder: group.sortOrder,
    })
  }
  return dict
}
