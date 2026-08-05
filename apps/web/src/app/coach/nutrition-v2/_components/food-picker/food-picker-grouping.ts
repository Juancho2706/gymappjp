/**
 * Helpers PUROS del picker de alimentos unificado (Nutricion V2 coach).
 *
 * Sin React, sin Supabase: deciden (a) en que grupo de origen cae cada resultado de busqueda y
 * (b) que hace el picker con las restricciones dietarias del alumno. Se testean solos
 * (`food-picker-grouping.test.ts`) porque son las dos reglas que, si se rompen, o le muestran al
 * coach el catalogo desordenado o —peor— le dejan prescribir un alergeno sin friccion.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'

// ── Agrupacion por origen ────────────────────────────────────────────────────────────────────

/**
 * Grupos del listado de resultados, en el ORDEN en que se pintan. "Con marca" va SIEMPRE al
 * final: son los productos de Open Food Facts / USDA (ruido de supermercado), utiles pero nunca
 * lo primero que el coach quiere ver.
 */
export type FoodPickerGroupId = 'history' | 'mine' | 'catalog' | 'branded'

export const FOOD_PICKER_GROUP_ORDER: readonly FoodPickerGroupId[] = [
  'history',
  'mine',
  'catalog',
  'branded',
]

/** Fuentes de catalogo que se consideran "con marca" (producto envasado de un tercero). */
const BRANDED_SOURCES = new Set(['open_food_facts', 'usda'])

export interface FoodPickerGroup {
  id: FoodPickerGroupId
  title: string
  items: FoodCatalogItem[]
}

export interface FoodPickerGroupingInput {
  /** Ids que el alumno YA consumio (clientRecent de las sugerencias). */
  recentIds?: ReadonlySet<string> | null
  /** Coach autenticado: sus alimentos propios se separan del catalogo global. */
  viewerCoachId?: string | null
  /** Nombre del alumno para el titulo del historial ("Del historial de Ana"). */
  clientName?: string | null
}

/**
 * ¿A que grupo pertenece este resultado? Orden de precedencia (el primero que aplica gana):
 *  1. `history`  — el alumno ya lo comio (senal mas fuerte que cualquier otra),
 *  2. `mine`     — alimento del propio coach (`foods.coach_id` = el coach en pantalla),
 *  3. `branded`  — producto de marca (fuente OFF/USDA o con GTIN),
 *  4. `catalog`  — el resto (EVA, importados, alimentos de otros coaches visibles).
 */
export function foodPickerGroupOf(
  item: FoodCatalogItem,
  input: FoodPickerGroupingInput = {},
): FoodPickerGroupId {
  if (input.recentIds?.has(item.id)) return 'history'
  if (input.viewerCoachId != null && item.coachId != null && item.coachId === input.viewerCoachId) {
    return 'mine'
  }
  if (BRANDED_SOURCES.has(item.source) || item.gtin != null) return 'branded'
  return 'catalog'
}

export function foodPickerGroupTitle(id: FoodPickerGroupId, clientName?: string | null): string {
  switch (id) {
    case 'history':
      return clientName ? `Del historial de ${clientName}` : 'Del historial del alumno'
    case 'mine':
      return 'Mis alimentos'
    case 'catalog':
      return 'Catálogo'
    case 'branded':
      return 'Con marca'
  }
}

/**
 * Reparte los resultados en grupos con titulo, conservando el orden de relevancia que trajo la
 * busqueda DENTRO de cada grupo y descartando los grupos vacios. Nunca duplica un item.
 */
export function groupFoodPickerResults(
  items: readonly FoodCatalogItem[],
  input: FoodPickerGroupingInput = {},
): FoodPickerGroup[] {
  const buckets = new Map<FoodPickerGroupId, FoodCatalogItem[]>()
  for (const item of items) {
    const id = foodPickerGroupOf(item, input)
    const bucket = buckets.get(id)
    if (bucket) bucket.push(item)
    else buckets.set(id, [item])
  }
  return FOOD_PICKER_GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    title: foodPickerGroupTitle(id, input.clientName),
    items: buckets.get(id) as FoodCatalogItem[],
  }))
}

// ── Restricciones dietarias del alumno ───────────────────────────────────────────────────────

export type FoodPickerRestrictionKind = 'allergy' | 'intolerance' | 'dislike'

/** Restriccion declarada del alumno, en la forma minima que el picker necesita. */
export interface FoodPickerRestriction {
  foodId: string
  kind: FoodPickerRestrictionKind
}

export interface FoodPickerRestrictionState {
  /** `true` solo para ALERGIA: la fila no se puede agregar sin override explicito. */
  blocked: boolean
  kind: FoodPickerRestrictionKind | null
  /** Etiqueta corta para el aviso de la fila (`null` = sin restriccion). */
  label: string | null
  /** Tono del aviso: rojo bloqueante para alergia, ambar informativo para el resto. */
  tone: 'danger' | 'warning' | null
}

export const FOOD_PICKER_NO_RESTRICTION: FoodPickerRestrictionState = {
  blocked: false,
  kind: null,
  label: null,
  tone: null,
}

const RESTRICTION_LABEL: Record<FoodPickerRestrictionKind, string> = {
  allergy: 'Alergia declarada',
  intolerance: 'Intolerancia declarada',
  dislike: 'No le gusta',
}

/** Indexa las restricciones por alimento. La alergia GANA sobre cualquier otra declaracion. */
export function foodPickerRestrictionIndex(
  restrictions: readonly FoodPickerRestriction[] | null | undefined,
): Map<string, FoodPickerRestrictionKind> {
  const index = new Map<string, FoodPickerRestrictionKind>()
  for (const restriction of restrictions ?? []) {
    const current = index.get(restriction.foodId)
    if (current === 'allergy') continue
    if (restriction.kind === 'allergy' || current == null) index.set(restriction.foodId, restriction.kind)
  }
  return index
}

/**
 * Gate de la fila: que puede hacer el coach con este alimento segun lo declarado por el alumno.
 *
 * ALERGIA => bloqueada (fail-closed). El coach puede prescribirla igual, pero solo con un
 * override EXPLICITO ("Usar igual" + confirmacion inline): no es un veto clinico, es evitar que
 * se cuele por inercia en una lista de 20 resultados.
 * Intolerancia / disgusto => aviso ambar, jamas bloqueo.
 */
export function foodPickerRestrictionState(
  foodId: string,
  index: ReadonlyMap<string, FoodPickerRestrictionKind> | null | undefined,
): FoodPickerRestrictionState {
  const kind = index?.get(foodId)
  if (!kind) return FOOD_PICKER_NO_RESTRICTION
  return {
    blocked: kind === 'allergy',
    kind,
    label: RESTRICTION_LABEL[kind],
    tone: kind === 'allergy' ? 'danger' : 'warning',
  }
}

/**
 * ¿Se puede agregar esta fila ahora mismo? Solo la alergia SIN override explicito lo impide.
 * Centraliza la regla para que la lista, el teclado (Enter) y el boton "+" no puedan divergir.
 */
export function canAddFoodPickerItem(
  state: FoodPickerRestrictionState,
  overridden: boolean,
): boolean {
  return !state.blocked || overridden
}
