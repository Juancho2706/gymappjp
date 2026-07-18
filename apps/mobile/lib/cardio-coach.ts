/**
 * cardio-coach — datos del modulo Cardio del lado COACH (E6-03).
 *
 * Dos responsabilidades money-safe:
 *  - LECTURA (picker + prefill): los alumnos del coach con sus columnas cardio (perfil M4)
 *    se leen por PostgREST directo. NO es mutacion de modulo → RLS `clients.coach_id =
 *    auth.uid()` alcanza (scope standalone: org_id/team_id null, espejo de
 *    findCardioClients en apps/web). Con `hasModule('cardio')` en OFF la pantalla NO llama
 *    a estas funciones (cero fetch).
 *  - MUTACION (guardar perfil): SIEMPRE via el endpoint `/api/mobile/cardio/profile`, que
 *    aplica `assertModule('cardio')` server-side (la RLS de clients NO chequea
 *    enabled_modules → escribir por PostgREST evadiria el cobro). Nunca UPDATE directo.
 *
 * db-compat: el APK puede pegar a una prod standalone sin columnas enterprise (org_id/
 * team_id) o sin `ref_5k_time_sec`. Lecturas con selectWithFallback (rico → minimo).
 */
import { supabase } from './supabase'
import { apiFetch } from './api'
import { selectWithFallback } from './db-compat'

export interface CardioClientRow {
  id: string
  full_name: string | null
  birth_date: string | null
  resting_hr: number | null
  max_hr_override: number | null
  ref_5k_time_sec: number | null
}

const RICH_COLS = 'id, full_name, birth_date, resting_hr, max_hr_override, ref_5k_time_sec'
const BASE_COLS = 'id, full_name, birth_date, resting_hr, max_hr_override'

function normalizeRow(r: any): CardioClientRow {
  return {
    id: r.id,
    full_name: r.full_name ?? null,
    birth_date: r.birth_date ?? null,
    resting_hr: r.resting_hr ?? null,
    max_hr_override: r.max_hr_override ?? null,
    ref_5k_time_sec: r.ref_5k_time_sec ?? null,
  }
}

/**
 * Alumnos del coach con su perfil cardio, orden alfabetico. Espejo del scope standalone
 * de `findCardioClients` (coach_id, org_id null, team_id null). Rico = con ref_5k + filtros
 * enterprise; minimo = solo coach_id (prod standalone vieja). [] ante error / sin sesion.
 */
export async function listCardioClients(): Promise<CardioClientRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await selectWithFallback<any>(
    () =>
      supabase
        .from('clients')
        .select(RICH_COLS)
        .eq('coach_id', user.id)
        .is('org_id', null)
        .is('team_id', null)
        .order('full_name', { ascending: true }),
    () =>
      supabase
        .from('clients')
        .select(BASE_COLS)
        .eq('coach_id', user.id)
        .order('full_name', { ascending: true }),
  )
  return (Array.isArray(data) ? data : []).map(normalizeRow)
}

/** Perfil cardio de UN alumno (prefill del editor). RLS del coach alcanza; null si no existe. */
export async function getCardioClient(clientId: string): Promise<CardioClientRow | null> {
  const { data } = await selectWithFallback<any>(
    () => supabase.from('clients').select(RICH_COLS).eq('id', clientId).maybeSingle(),
    () => supabase.from('clients').select(BASE_COLS).eq('id', clientId).maybeSingle(),
  )
  return data ? normalizeRow(data) : null
}

export interface SaveCardioProfileInput {
  clientId: string
  birth_date: string | null
  resting_hr: number | null
  max_hr_override: number | null
  ref_5k_time_sec: number | null
}

/**
 * Guarda el perfil cardio del alumno via el endpoint mobile (gate de dinero server-side:
 * assertModule('cardio') → 403 MODULE_OFF sin el modulo). NUNCA por PostgREST directo.
 */
export async function saveCardioProfile(input: SaveCardioProfileInput): Promise<void> {
  await apiFetch<{ ok: true }>('/api/mobile/cardio/profile', {
    method: 'POST',
    authenticated: true,
    body: input,
  })
}
