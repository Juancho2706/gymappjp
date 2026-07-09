import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Notes (feature E) del módulo de nutrición:
 *
 * 1. Meal comments (BIDIRECCIONAL coach ⇄ alumno) — hilo por comida/día sobre la
 *    bitácora del alumno. Tabla `nutrition_meal_comments`. Ambos roles escriben y
 *    leen; el `author_id` SIEMPRE sale de la sesión, nunca del body.
 * 2. Private notes (SOLO coach) — notas internas del coach sobre el alumno, que el
 *    alumno nunca ve. Tabla `nutrition_private_notes`. RLS coach-scoped.
 */

export type MealCommentRow = Database['public']['Tables']['nutrition_meal_comments']['Row']
export type PrivateNoteRow = Database['public']['Tables']['nutrition_private_notes']['Row']

export type CommentAuthorRole = 'coach' | 'client'

export type AddMealCommentInput = {
  clientId: string
  /** Ancla el comentario a un log de comida concreto (opcional). */
  mealLogId?: string | null
  /** Ancla al día (YYYY-MM-DD). Requerido si no hay `mealLogId`. */
  logDate?: string | null
  body: string
  authorRole: CommentAuthorRole
  /**
   * uid del autor. Opcional: por defecto se deriva de la sesión (`getClaims`) —
   * el camino de la web (createClient con cookies). El bridge móvil corre con un
   * cliente token-scoped (anon + Bearer header) que NO tiene sesión persistida, así
   * que `getClaims()` no resuelve; ese caller pasa el uid autoritativo (resuelto por
   * `admin.auth.getUser(token)`) explícitamente. Sea cual sea el origen, la RLS
   * (`with_check`) es la 2da capa que impide falsear `author_id`.
   */
  authorId?: string
}

export class NutritionNotesService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /** uid de la sesión (getClaims: verificación local del JWT, sin /user). */
  private async sessionUserId(): Promise<string | null> {
    const { data } = await this.supabase.auth.getClaims()
    return (data?.claims?.sub as string | undefined) ?? null
  }

  /**
   * Agrega un comentario bidireccional al hilo de un alumno. `author_id` = uid de
   * la sesión; `author_role` indica si lo escribe el coach o el alumno. Debe
   * anclarse a un `mealLogId` o a un `logDate` (al menos uno).
   */
  async addMealComment(input: AddMealCommentInput): Promise<MealCommentRow> {
    const body = input.body?.trim()
    if (!body) throw new Error('El comentario no puede estar vacío.')
    if (!input.mealLogId && !input.logDate) {
      throw new Error('Se requiere mealLogId o logDate.')
    }

    const authorId = input.authorId ?? (await this.sessionUserId())
    if (!authorId) throw new Error('No autorizado.')

    const { data, error } = await this.supabase
      .from('nutrition_meal_comments')
      .insert({
        client_id: input.clientId,
        meal_log_id: input.mealLogId ?? null,
        log_date: input.logDate ?? null,
        body,
        author_id: authorId,
        author_role: input.authorRole,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  /**
   * Lista los comentarios de un alumno para un día dado (orden cronológico).
   * Incluye tanto los anclados al `logDate` como los de logs de comida de ese día
   * (los que traen `log_date` poblado).
   */
  async listMealComments(clientId: string, logDate: string): Promise<MealCommentRow[]> {
    const { data, error } = await this.supabase
      .from('nutrition_meal_comments')
      .select('*')
      .eq('client_id', clientId)
      .eq('log_date', logDate)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  }

  /**
   * Lista los comentarios anclados a un log de comida concreto (hilo por comida).
   */
  async listMealCommentsByLog(clientId: string, mealLogId: string): Promise<MealCommentRow[]> {
    const { data, error } = await this.supabase
      .from('nutrition_meal_comments')
      .select('*')
      .eq('client_id', clientId)
      .eq('meal_log_id', mealLogId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  }

  // ── Private notes (coach-only) ─────────────────────────────────────────────

  /**
   * Crea o actualiza la nota privada del coach sobre un alumno (una por par
   * coach↔alumno). `coachId` proviene de la sesión del caller.
   */
  async upsertPrivateNote(
    coachId: string,
    clientId: string,
    body: string
  ): Promise<PrivateNoteRow> {
    // No hay UNIQUE(coach_id, client_id) en la tabla → find-then-update/insert.
    const { data: existing } = await this.supabase
      .from('nutrition_private_notes')
      .select('id')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await this.supabase
        .from('nutrition_private_notes')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    }

    const { data, error } = await this.supabase
      .from('nutrition_private_notes')
      .insert({ coach_id: coachId, client_id: clientId, body })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  /** Lista las notas privadas del coach sobre un alumno (coach-scoped por RLS). */
  async listPrivateNotes(clientId: string): Promise<PrivateNoteRow[]> {
    const { data, error } = await this.supabase
      .from('nutrition_private_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  }
}
