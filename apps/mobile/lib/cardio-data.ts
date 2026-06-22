import { supabase } from './supabase'
import { apiFetch, ApiError } from './api'
import { CardioProfileUpdateSchema } from '@eva/schemas'

/**
 * Datos del módulo cardio (mobile). Las LECTURAS son DIRECTAS por PostgREST bajo la
 * sesión del coach (RLS SELECT: clients.coach_id = auth.uid()). La ESCRITURA pasa por
 * /api/mobile/cardio/profile, que corre assertModule('cardio') SERVER-SIDE antes de
 * tocar la fila: la RLS de clients NO chequea enabled_modules, así que el PostgREST
 * directo dejaba a un coach sin el módulo escribir igual (evasión de cobro). Standalone v1.
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

/**
 * Guarda el perfil cardio. Valida con el schema compartido (feedback inmediato + mismo
 * shape de error que el server) y luego escribe vía /api/mobile/cardio/profile, que
 * gatea el módulo SERVER-SIDE (assertModule) y valida el scope del alumno. El write ya
 * NO va por PostgREST directo (la RLS no chequea el entitlement → era evasión de cobro).
 */
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
  try {
    await apiFetch('/api/mobile/cardio/profile', {
      method: 'POST',
      authenticated: true,
      body: parsed.data,
    })
    return { error: null }
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    return { error: e instanceof Error ? e.message : 'No se pudo guardar el perfil.' }
  }
}
