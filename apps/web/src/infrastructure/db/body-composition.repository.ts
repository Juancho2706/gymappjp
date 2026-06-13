import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type BodyCompositionRow = Tables['body_composition_measurements']['Row']
export type BodyCompositionInsert = Tables['body_composition_measurements']['Insert']

/**
 * Repository de mediciones de composicion corporal (datos de salud, Ley 21.719).
 * Capa de acceso a DB user-scoped: RLS (bcm_*) es el techo de seguridad; estos metodos NO
 * hacen `SELECT *` (columnas explicitas) y excluyen los soft-deleted (`deleted_at IS NULL`)
 * en las LECTURAS de negocio — el filtro de RLS deja la fila soft-deleted visible para
 * restore/auditoria, la exclusion de negocio es responsabilidad de esta capa.
 *
 * El gating de modulo + consentimiento + calculo vive en el service; aqui solo I/O.
 */

// Columnas explicitas (sin `*` — pilar de Queries de CLAUDE.md). raw_input se omite en las
// listas (payload grande); se incluye solo en getById para la edicion/detalle.
const LIST_COLUMNS =
    'id, client_id, coach_id, team_id, org_id, method, measured_at, weight_kg, height_cm, ' +
    'device_brand, device_model, equation_used, metrics, measurement_conditions, source, ' +
    'is_validated, consent_confirmed_at, notes, created_by, created_at, updated_at, deleted_at'

const DETAIL_COLUMNS = `${LIST_COLUMNS}, raw_input`

export type BodyCompositionMethod = 'bia' | 'isak'

/**
 * Fila minima del alumno para resolver SU contexto de modulo (vista read-only del alumno).
 * Identidad legacy: clients.id = auth.uid() (mismo criterio que la vista de movimiento).
 */
export async function findClientScopeRow(
    db: DB,
    clientId: string
): Promise<{ id: string; full_name: string | null; team_id: string | null; coach_id: string | null } | null> {
    const { data, error } = await db
        .from('clients')
        .select('id, full_name, team_id, coach_id')
        .eq('id', clientId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

/** Lista las mediciones (no borradas) de un cliente para UN metodo, mas reciente primero. */
export async function listByClientAndMethod(
    db: DB,
    clientId: string,
    method: BodyCompositionMethod
): Promise<BodyCompositionRow[]> {
    const { data } = await db
        .from('body_composition_measurements')
        .select(LIST_COLUMNS)
        .eq('client_id', clientId)
        .eq('method', method)
        .is('deleted_at', null)
        .order('measured_at', { ascending: false })
    return (data ?? []) as unknown as BodyCompositionRow[]
}

/** Detalle (incluye raw_input) de una medicion no borrada. RLS gobierna la visibilidad. */
export async function getById(db: DB, id: string): Promise<BodyCompositionRow | null> {
    const { data } = await db
        .from('body_composition_measurements')
        .select(DETAIL_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
    return (data as unknown as BodyCompositionRow) ?? null
}

/** Inserta una medicion. El WITH CHECK de RLS (bcm_insert) amarra client_id/team_id/coach_id. */
export async function insert(
    db: DB,
    values: BodyCompositionInsert
): Promise<{ row: BodyCompositionRow | null; error: string | null }> {
    const { data, error } = await db
        .from('body_composition_measurements')
        .insert(values)
        .select(DETAIL_COLUMNS)
        .single()
    return { row: (data as unknown as BodyCompositionRow) ?? null, error: error?.message ?? null }
}

/**
 * Soft-delete (UPDATE de deleted_at). NO hay DELETE para authenticated (grant ni policy);
 * el hard-delete queda en service_role. Idempotente: solo afecta filas aun no borradas.
 */
export async function softDelete(
    db: DB,
    id: string
): Promise<{ error: string | null }> {
    const { error } = await db
        .from('body_composition_measurements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null)
    return { error: error?.message ?? null }
}
