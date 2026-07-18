import { apiFetch } from './api'

/**
 * Búsqueda global del coach (RN) — data layer.
 *
 * Consume `/api/mobile/coach/search` (puente Bearer que reutiliza el mismo `searchCoachWorkspace`
 * del topbar web). Devuelve las 4 categorías agrupadas (Alumnos / Programas / Ejercicios / Recetas)
 * con el scope 3-vías resuelto server-side. La capa de UI (hook `CoachSearchPalette`) traduce cada
 * `href` web a la ruta mobile equivalente por grupo — este módulo NO conoce navegación.
 */

/** Un resultado (misma forma que `SearchHit` de services/search en web). */
export type CoachSearchHit = {
  id: string
  label: string
  sublabel?: string
  /** Ruta WEB canónica (p.ej. `/coach/clients/{id}`). El hook la traduce a ruta mobile. */
  href: string
  thumbUrl?: string | null
}

export type CoachSearchResults = {
  clients: CoachSearchHit[]
  programs: CoachSearchHit[]
  exercises: CoachSearchHit[]
  recipes: CoachSearchHit[]
}

/** Mínimo de caracteres antes de golpear la DB (espejo de `MIN_QUERY_LENGTH` web). */
export const COACH_SEARCH_MIN_CHARS = 2

export function emptyCoachSearchResults(): CoachSearchResults {
  return { clients: [], programs: [], exercises: [], recipes: [] }
}

/**
 * Ejecuta la búsqueda. Sub-mínimo → vacío sin request. `signal` cancela la request en vuelo
 * (el consumidor usa AbortController + debounce). Un AbortError se propaga y lo ignora el hook.
 */
export async function searchCoachWorkspace(
  query: string,
  signal?: AbortSignal,
): Promise<CoachSearchResults> {
  const q = query.trim()
  if (q.length < COACH_SEARCH_MIN_CHARS) return emptyCoachSearchResults()
  return apiFetch<CoachSearchResults>(`/api/mobile/coach/search?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    authenticated: true,
    signal,
  })
}
