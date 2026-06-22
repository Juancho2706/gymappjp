// Zona C (coach) de Nutrición en mobile — paridad con la web (NutritionTabB5):
//   · Hilo bidireccional de comentarios (coach ⇄ alumno) anclado al día de hoy.
//   · Nota privada del coach sobre el alumno (una por par coach↔alumno; el alumno NUNCA la ve).
//   · Umbrales de micronutrientes del alumno (nutrient_targets).
//   · Historial de ciclos del plan (nutrition_plan_history).
// Todo via el cliente `supabase` con la sesión del coach (RLS coach-scoped). Service-role nunca corre en RN.
// Espejo de services/nutrition-notes.service.ts + nutrient-targets.service.ts del web.

import { supabase } from './supabase'

export interface MealCommentRow {
  id: string
  author_role: 'coach' | 'client'
  body: string
  created_at: string
}

export interface PrivateNoteRow {
  id: string
  body: string
  created_at: string
  updated_at: string
}

export interface NutrientTargetRow {
  id: string
  nutrient_key: string
  intent: string
  target_value: number | null
  floor_value: number | null
  ceiling_value: number | null
  provenance: string | null
}

export interface NutritionCycleRow {
  id: string
  label: string | null
  source: string
  created_at: string
}

// ── Hilo de comentarios (coach ⇄ alumno) del día ──────────────────────────────
export async function listCoachMealComments(clientId: string, logDate: string): Promise<MealCommentRow[]> {
  const { data, error } = await supabase
    .from('nutrition_meal_comments')
    .select('id, author_role, body, created_at')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .order('created_at', { ascending: true })
  if (error) return []
  return ((data as any[]) ?? []).map((c) => ({
    id: String(c.id),
    author_role: c.author_role === 'coach' ? 'coach' : 'client',
    body: String(c.body ?? ''),
    created_at: String(c.created_at),
  }))
}

// `author_id` SIEMPRE sale de la sesión, nunca del body (espejo del service web).
export async function addCoachMealComment(
  clientId: string,
  logDate: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'El comentario no puede estar vacío.' }
  const { data: auth } = await supabase.auth.getUser()
  const authorId = auth.user?.id
  if (!authorId) return { ok: false, error: 'No autorizado.' }
  const { error } = await supabase.from('nutrition_meal_comments').insert({
    client_id: clientId,
    meal_log_id: null,
    log_date: logDate,
    body: trimmed,
    author_id: authorId,
    author_role: 'coach',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Nota privada del coach (una por par coach↔alumno) ─────────────────────────
export async function getCoachPrivateNotes(clientId: string): Promise<PrivateNoteRow[]> {
  const { data, error } = await supabase
    .from('nutrition_private_notes')
    .select('id, body, created_at, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  if (error) return []
  return ((data as any[]) ?? []).map((n) => ({
    id: String(n.id),
    body: String(n.body ?? ''),
    created_at: String(n.created_at),
    updated_at: String(n.updated_at),
  }))
}

// find-then-update/insert (no hay UNIQUE en la tabla) — espejo del service web.
export async function upsertCoachPrivateNote(
  coachId: string,
  clientId: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'La nota no puede estar vacía.' }
  const { data: existing } = await supabase
    .from('nutrition_private_notes')
    .select('id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if ((existing as any)?.id) {
    const { error } = await supabase
      .from('nutrition_private_notes')
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq('id', (existing as any).id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await supabase
    .from('nutrition_private_notes')
    .insert({ coach_id: coachId, client_id: clientId, body: trimmed })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Umbrales de micronutrientes del alumno ────────────────────────────────────
export async function getClientNutrientTargets(clientId: string): Promise<NutrientTargetRow[]> {
  const { data, error } = await supabase
    .from('nutrient_targets')
    .select('id, nutrient_key, intent, target_value, floor_value, ceiling_value, provenance')
    .eq('client_id', clientId)
  if (error) return []
  return ((data as any[]) ?? []).map((t) => ({
    id: String(t.id),
    nutrient_key: String(t.nutrient_key),
    intent: String(t.intent ?? ''),
    target_value: t.target_value == null ? null : Number(t.target_value),
    floor_value: t.floor_value == null ? null : Number(t.floor_value),
    ceiling_value: t.ceiling_value == null ? null : Number(t.ceiling_value),
    provenance: t.provenance ?? null,
  }))
}

// ── Historial de ciclos del plan ──────────────────────────────────────────────
export async function getNutritionPlanCycles(clientId: string): Promise<NutritionCycleRow[]> {
  const { data, error } = await supabase
    .from('nutrition_plan_history')
    .select('id, label, source, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) return []
  return ((data as any[]) ?? []).map((c) => ({
    id: String(c.id),
    label: c.label ?? null,
    source: String(c.source ?? ''),
    created_at: String(c.created_at),
  }))
}
