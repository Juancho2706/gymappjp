/**
 * Lógica pura (framework-neutral) de favoritos de alimento del alumno.
 * Compartida web + RN para dar paridad 1:1 sin duplicar la regla de orden.
 *
 * Fuente de verdad de la marca de favorito: la tabla V1 `client_food_preferences`
 * (`preference_type='favorite'`). Aquí solo vive la presentación (orden), no la
 * escritura — esa la hacen las actions/queries scoped de cada plataforma.
 */

/**
 * Reordena una lista de resultados del catálogo poniendo los favoritos del alumno
 * PRIMERO. Orden ESTABLE: preserva el orden relativo original dentro de cada grupo
 * (favoritos y no favoritos), así el ranking del RPC de búsqueda no se altera más
 * allá de subir los favoritos. Puro: no muta la entrada.
 */
export function sortFoodsByFavoriteFirst<T extends { id: string }>(
  items: readonly T[],
  favoriteIds: ReadonlySet<string>,
): T[] {
  if (favoriteIds.size === 0) return items.slice()
  const favorites: T[] = []
  const rest: T[] = []
  for (const item of items) {
    if (favoriteIds.has(item.id)) favorites.push(item)
    else rest.push(item)
  }
  return [...favorites, ...rest]
}
