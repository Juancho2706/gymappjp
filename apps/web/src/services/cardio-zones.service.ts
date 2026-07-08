import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CardioProfile, ResolvedClientZones } from '@eva/cardio'
import { resolveClientZones } from '@eva/cardio'
import { hasModule } from '@/services/entitlements.service'
import {
    findCardioClients,
    findClientCardioProfile,
    updateClientCardioProfile,
    type CardioProfileRow,
} from '@/infrastructure/db/cardio-profile.repository'

type DB = SupabaseClient<Database>

/**
 * Orquestación del módulo `cardio` (specs/movida-entrenamiento F7):
 * perfil del cliente (repository) → dominio puro (@eva/cardio) → zonas resueltas.
 * El gating se resuelve por el CONTEXTO DEL RECURSO (alumno de pool ⇒ su team;
 * si no ⇒ su coach) — regla LOCKED de entitlements.service.
 */

/** Mapeo snake_case (DB) → CardioProfile del dominio (el dominio nunca ve columnas). */
export function cardioProfileFromRow(
    row: Pick<CardioProfileRow, 'birth_date' | 'resting_hr' | 'max_hr_override'> | null | undefined
): CardioProfile {
    return {
        birthDate: row?.birth_date ?? null,
        restingHr: row?.resting_hr ?? null,
        maxHrOverride: row?.max_hr_override ?? null,
    }
}

export interface ClientZonesResult {
    /** Módulo cardio habilitado para el contexto del cliente (team manda). */
    enabled: boolean
    /** Zonas personalizadas; null si el perfil no permite derivar bpm (UI: "Z4" + CTA). */
    zones: ResolvedClientZones | null
    profile: CardioProfile
}

/**
 * Zonas FC personalizadas de un cliente, gateadas por el módulo `cardio` del contexto
 * del RECURSO (client.team_id ⇒ team; si no ⇒ client.coach_id). Si el módulo está OFF
 * devuelve { enabled: false, zones: null } — la UI cae al render de hoy sin chips.
 * `entitlementsDb` permite pasar un client distinto SOLO para leer enabled_modules
 * (el alumno no puede leer teams.enabled_modules vía RLS; ver workout-execution.queries).
 */
export async function getClientZonesForContext(
    db: DB,
    clientId: string,
    entitlementsDb: DB = db
): Promise<ClientZonesResult> {
    const row = await findClientCardioProfile(db, clientId)
    const profile = cardioProfileFromRow(row)
    if (!row) return { enabled: false, zones: null, profile }

    const enabled = await hasModule(entitlementsDb, 'cardio', {
        teamId: row.team_id,
        coachId: row.team_id ? null : row.coach_id,
    })
    if (!enabled) return { enabled: false, zones: null, profile }

    return { enabled: true, zones: resolveClientZones(profile), profile }
}

/** Lista de clientes del workspace ACTIVO con su perfil cardio (página /coach/cardio). */
export async function listCardioClients(
    db: DB,
    scope: { coachId: string; activeTeamId: string | null }
): Promise<CardioProfileRow[]> {
    return findCardioClients(db, scope)
}

/**
 * Perfil cardio de un cliente VALIDANDO que pertenezca al workspace activo
 * (team pool o standalone propio) — para el editor del coach. null si no es accesible.
 */
export async function getCardioClientForCoach(
    db: DB,
    clientId: string,
    scope: { coachId: string; activeTeamId: string | null }
): Promise<CardioProfileRow | null> {
    const row = await findClientCardioProfile(db, clientId)
    if (!row || row.org_id != null) return null
    if (scope.activeTeamId) {
        return row.team_id === scope.activeTeamId ? row : null
    }
    return row.coach_id === scope.coachId && row.team_id == null ? row : null
}

/** Update del perfil cardio (el caller YA validó módulo + Zod; acá se valida el scope). */
export async function saveCardioProfile(
    db: DB,
    clientId: string,
    scope: { coachId: string; activeTeamId: string | null },
    values: {
        birth_date?: string | null
        resting_hr?: number | null
        max_hr_override?: number | null
        ref_5k_time_sec?: number | null
    }
): Promise<{ error: string | null }> {
    const row = await getCardioClientForCoach(db, clientId, scope)
    if (!row) return { error: 'Alumno no encontrado.' }
    return updateClientCardioProfile(db, clientId, values)
}
