import { apiFetch } from './api'

/**
 * Bridge del hilo de notas bidireccional coach⇄alumno de nutrición (E4-12).
 * Espejo mobile de `/api/mobile/nutrition/notes` (route.ts): GET por día y POST
 * del alumno. El scope es POR DÍA (logDate = YYYY-MM-DD) igual que la web
 * (`getClientMealComments` / `addClientMealComment`). El `author_id` y el
 * `clientId` los deriva el server del bearer — NUNCA se envían desde acá.
 */

export interface NutritionNoteComment {
  id: string
  author_role: 'client' | 'coach'
  body: string
  created_at: string
}

/** GET del hilo del día (orden cronológico ascendente). */
export function getNutritionNotes(date: string) {
  return apiFetch<{ comments: NutritionNoteComment[] }>(
    `/api/mobile/nutrition/notes?date=${encodeURIComponent(date)}`,
    { authenticated: true },
  )
}

/** POST de una nota del alumno anclada al día. */
export function postNutritionNote(input: { logDate: string; body: string }) {
  return apiFetch<{ comment: NutritionNoteComment }>('/api/mobile/nutrition/notes', {
    method: 'POST',
    authenticated: true,
    body: input,
  })
}
