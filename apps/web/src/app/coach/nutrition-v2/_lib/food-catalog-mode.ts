/**
 * Maquina de modos del tab Alimentos (T2.3 F4.5). PURA: sin React, sin Supabase, sin URL.
 *
 * El tab tiene TRES data paths incompatibles entre si (keyset sobre la RPC, offset sobre `foods`,
 * offset sobre `coach_food_overrides`) y dos chips excluyentes. Decidir "que estoy mostrando" con
 * booleanos sueltos dentro del componente ya habia costado un bug de cursores mezclados en F1, asi
 * que la decision vive aca, en una funcion total y testeable, y el componente solo la obedece.
 *
 * Los cinco modos:
 *
 *  - `browse`  — sin filtro y sin texto: primera pagina del catalogo por nombre (F4.5 (1)).
 *  - `invite`  — sin filtro y con texto DEMASIADO CORTO para la RPC (1 caracter).
 *  - `search`  — sin filtro y con 2+ caracteres: `search_food_catalog_v2`, keyset.
 *  - `mine`    — chip "Solo mios": mis alimentos por offset, texto filtra LOCAL.
 *  - `edited`  — chip "Editados por mi": mis correcciones por offset, texto filtra LOCAL.
 */

/** Lo que el coach eligio en los chips. Excluyente por construccion: es UN valor, no dos flags. */
export type FoodFilterMode = 'all' | 'edited' | 'mine'

/** Que esta mostrando el tab ahora mismo. Derivado, nunca guardado en estado. */
export type FoodCatalogMode = 'browse' | 'invite' | 'search' | 'mine' | 'edited'

/** Minimo de caracteres que exige `search_food_catalog_v2` (y por debajo del cual no se consulta). */
export const FOOD_SEARCH_MIN_QUERY = 2

/** Valor del parametro `?foods=` por modo de filtro. El default (`all`) se omite de la URL. */
const FILTER_MODE_PARAM_VALUES: Record<Exclude<FoodFilterMode, 'all'>, string> = {
  edited: 'editados',
  mine: 'mios',
}

export const FOOD_FILTER_PARAM = 'foods'

/**
 * Modo de filtro desde el parametro de URL. Un valor desconocido cae a `all`: un deep-link viejo o
 * roto muestra el catalogo, jamas una pantalla vacia.
 */
export function foodFilterModeFromParam(value: string | null | undefined): FoodFilterMode {
  if (value === FILTER_MODE_PARAM_VALUES.edited) return 'edited'
  if (value === FILTER_MODE_PARAM_VALUES.mine) return 'mine'
  return 'all'
}

/** Valor a escribir en `?foods=`, o `null` cuando el modo es el default y el param se omite. */
export function foodFilterModeToParam(mode: FoodFilterMode): string | null {
  return mode === 'all' ? null : FILTER_MODE_PARAM_VALUES[mode]
}

/**
 * Que pasa al tocar un chip. Los dos chips son EXCLUYENTES: tocar el inactivo cambia directo a el
 * (apagando el otro, sin pasar por un estado intermedio) y tocar el activo lo apaga y vuelve al
 * catalogo. Es la semantica de un radio-group con deseleccion, no la de dos checkboxes.
 */
export function nextFoodFilterMode(
  current: FoodFilterMode,
  chip: Exclude<FoodFilterMode, 'all'>,
): FoodFilterMode {
  return current === chip ? 'all' : chip
}

/**
 * El modo efectivo. El filtro MANDA sobre el texto: dentro de "Solo mios"/"Editados por mi" el
 * texto no dispara consulta, filtra en cliente el universo ya cargado (son decenas de filas), asi
 * que no existe un modo "buscar dentro del filtro" con data path propio.
 *
 * Sin filtro, el texto decide: vacio muestra el catalogo (`browse`), 1 caracter no alcanza para la
 * RPC (`invite`) y 2+ buscan (`search`).
 */
export function resolveFoodCatalogMode(input: {
  filterMode: FoodFilterMode
  /** Texto YA debounceado y trimmeado. */
  query: string
}): FoodCatalogMode {
  if (input.filterMode === 'edited') return 'edited'
  if (input.filterMode === 'mine') return 'mine'
  const length = input.query.trim().length
  if (length === 0) return 'browse'
  if (length < FOOD_SEARCH_MIN_QUERY) return 'invite'
  return 'search'
}

/**
 * ¿El texto escrito filtra en cliente en este modo? Solo los modos cuyo universo ya esta entero (o
 * casi) en memoria. En `search` el texto ES la consulta, y en `browse` filtrar local mentiria: el
 * coach veria una pagina de 20 recortada y creeria que el catalogo no tiene mas.
 */
export function usesLocalTextFilter(mode: FoodCatalogMode): boolean {
  return mode === 'mine' || mode === 'edited'
}

/**
 * ¿Este modo lee la primera pagina por OFFSET al entrar? Es el disparador del efecto de listado;
 * `search` lo maneja el efecto de busqueda e `invite` no consulta nada.
 */
export function isOffsetListMode(mode: FoodCatalogMode): boolean {
  return mode === 'browse' || mode === 'mine' || mode === 'edited'
}
