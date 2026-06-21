import { supabase } from './supabase'

/**
 * Notas del dia (hilo bidireccional coach <-> alumno) — lado ALUMNO (mobile).
 *
 * Espejo de:
 *  - apps/web/src/services/nutrition-notes.service.ts (addMealComment / listMealComments)
 *  - apps/web/src/app/c/[coach_slug]/nutrition/_data/nutrition-notes.queries.ts
 *
 * Tabla `nutrition_meal_comments`: ambos roles escriben y leen; el `author_id` SIEMPRE sale de
 * la sesion (auth.uid()), nunca del body. RLS refuerza el aislamiento por alumno.
 */

export type MealCommentRow = {
  id: string
  client_id: string
  author_id: string
  author_role: 'coach' | 'client'
  body: string
  log_date: string | null
  meal_log_id: string | null
  created_at: string
}

/** Comentarios del alumno para un dia (orden cronologico). El alumno solo ve su propio hilo. */
export async function listMealComments(
  clientId: string,
  logDate: string
): Promise<MealCommentRow[]> {
  try {
    const { data, error } = await supabase
      .from('nutrition_meal_comments')
      .select('id, client_id, author_id, author_role, body, log_date, meal_log_id, created_at')
      .eq('client_id', clientId)
      .eq('log_date', logDate)
      .order('created_at', { ascending: true })
    if (error) return []
    return (data ?? []) as MealCommentRow[]
  } catch {
    return []
  }
}

/**
 * Agrega un comentario del ALUMNO anclado al dia. `author_id` = sesion; `author_role='client'`.
 * Espejo de addClientMealComment.
 */
export async function addMealComment(input: {
  clientId: string
  logDate: string
  body: string
}): Promise<{ ok: boolean; comment?: MealCommentRow; error?: string }> {
  const body = input.body?.trim()
  if (!body) return { ok: false, error: 'El comentario no puede estar vacio.' }
  try {
    const { data: auth } = await supabase.auth.getUser()
    const authorId = auth.user?.id
    if (!authorId) return { ok: false, error: 'No autorizado.' }

    const { data, error } = await supabase
      .from('nutrition_meal_comments')
      .insert({
        client_id: input.clientId,
        meal_log_id: null,
        log_date: input.logDate,
        body,
        author_id: authorId,
        author_role: 'client',
      })
      .select('id, client_id, author_id, author_role, body, log_date, meal_log_id, created_at')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, comment: data as MealCommentRow }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo enviar la nota.' }
  }
}
