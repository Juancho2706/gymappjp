import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * Repository del perfil cardio del cliente (clients.birth_date / resting_hr /
 * max_hr_override / ref_5k_time_sec — M4 specs/movida-entrenamiento).
 * Solo acceso a datos: el scoping por workspace y el gating del módulo viven en
 * services/cardio-zones.service.ts. RLS de clients es el techo (AC9).
 */

export interface CardioProfileRow {
    id: string
    full_name: string | null
    birth_date: string | null
    resting_hr: number | null
    max_hr_override: number | null
    ref_5k_time_sec: number | null
    coach_id: string | null
    team_id: string | null
    org_id: string | null
}

const CARDIO_PROFILE_COLUMNS =
    'id, full_name, birth_date, resting_hr, max_hr_override, ref_5k_time_sec, coach_id, team_id, org_id'

/** Perfil cardio de UN cliente (columnas específicas, nunca SELECT *). */
export async function findClientCardioProfile(db: DB, clientId: string): Promise<CardioProfileRow | null> {
    const { data } = await db
        .from('clients')
        .select(CARDIO_PROFILE_COLUMNS)
        .eq('id', clientId)
        .maybeSingle()
    return (data as CardioProfileRow | null) ?? null
}

/**
 * Clientes con perfil cardio según el workspace ACTIVO (patrón CoachClientScope 3-vías):
 * team ⇒ alumnos de ESE pool; standalone ⇒ propios NO-pool. Enterprise fuera de alcance v1.
 */
export async function findCardioClients(
    db: DB,
    scope: { coachId: string; activeTeamId: string | null }
): Promise<CardioProfileRow[]> {
    let query = db
        .from('clients')
        .select(CARDIO_PROFILE_COLUMNS)
        .order('full_name', { ascending: true })
    if (scope.activeTeamId) {
        query = query.eq('team_id', scope.activeTeamId).is('org_id', null)
    } else {
        query = query.eq('coach_id', scope.coachId).is('org_id', null).is('team_id', null)
    }
    const { data } = await query
    return (data ?? []) as CardioProfileRow[]
}

/** Update parcial del perfil cardio. El caller YA validó scope + módulo + Zod. */
export async function updateClientCardioProfile(
    db: DB,
    clientId: string,
    values: {
        birth_date?: string | null
        resting_hr?: number | null
        max_hr_override?: number | null
        ref_5k_time_sec?: number | null
    }
): Promise<{ error: string | null }> {
    const { error } = await db.from('clients').update(values).eq('id', clientId)
    return { error: error?.message ?? null }
}
