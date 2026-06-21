import { supabase } from './supabase'
import { CardioProfileUpdateSchema } from '@eva/schemas'

/**
 * Datos del módulo cardio (mobile). Lecturas/escrituras DIRECTAS por PostgREST bajo
 * la sesión del coach (RLS: clients.coach_id = auth.uid()). El write usa las MISMAS
 * columnas que el server action web (que corre bajo la sesión del coach, no service-role)
 * → los GRANT de columna para `authenticated` ya existen, sin migración. Standalone v1.
 */

export interface CardioClientRow {
  id: string
  full_name: string | null
  birth_date: string | null
  resting_hr: number | null
  max_hr_override: number | null
  ref_5k_time_sec: number | null
}

/** Alumnos del coach con su perfil cardio (selector de la calculadora). */
export async function listCardioClients(): Promise<CardioClientRow[]> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, birth_date, resting_hr, max_hr_override, ref_5k_time_sec')
      .or('is_archived.is.null,is_archived.eq.false')
      .order('full_name')
    return ((data ?? []) as any[]).map((c) => ({
      id: c.id,
      full_name: c.full_name ?? null,
      birth_date: c.birth_date ?? null,
      resting_hr: c.resting_hr ?? null,
      max_hr_override: c.max_hr_override ?? null,
      ref_5k_time_sec: c.ref_5k_time_sec ?? null,
    })) as CardioClientRow[]
  } catch {
    return []
  }
}

/** Perfil cardio de un alumno (editor). null si no accesible. */
export async function getCardioClient(clientId: string): Promise<CardioClientRow | null> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, birth_date, resting_hr, max_hr_override, ref_5k_time_sec')
      .eq('id', clientId)
      .maybeSingle()
    if (!data) return null
    const c = data as any
    return {
      id: c.id,
      full_name: c.full_name ?? null,
      birth_date: c.birth_date ?? null,
      resting_hr: c.resting_hr ?? null,
      max_hr_override: c.max_hr_override ?? null,
      ref_5k_time_sec: c.ref_5k_time_sec ?? null,
    }
  } catch {
    return null
  }
}

export interface CardioProfileFormValues {
  birth_date?: string | null
  resting_hr?: string | null
  max_hr_override?: string | null
  ref_5k_time_sec?: string | null
}

/** Guarda el perfil cardio (valida con el schema compartido + escribe bajo RLS coach). */
export async function saveCardioProfile(
  clientId: string,
  values: CardioProfileFormValues
): Promise<{ error: string | null }> {
  const parsed = CardioProfileUpdateSchema.safeParse({
    clientId,
    birth_date: values.birth_date || null,
    resting_hr: values.resting_hr,
    max_hr_override: values.max_hr_override,
    ref_5k_time_sec: values.ref_5k_time_sec,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const { clientId: _id, ...patch } = parsed.data
  const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
  return { error: error ? error.message : null }
}
