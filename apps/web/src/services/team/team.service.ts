import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

type DB = SupabaseClient<Database>

export type TeamAccessAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'pdf_generate'

export type TeamAccessLogInput = {
    teamId: string
    actorCoachId: string
    clientId: string | null
    resource: string
    action: TeamAccessAction
    metadata?: Json
}

/**
 * Bitacora append-only de acceso a datos de salud del pool (Ley 21.719).
 * Espeja writeOrgAuditEvent (org.service). Inserta con el cliente request-scoped: auth.uid() = coach,
 * lo que satisface la policy team_access_logs_member_insert (is_team_member + self-attribution + client en team).
 * Best-effort: NUNCA lanza — una bitacora fallida no debe romper la lectura del coach.
 */
export async function logTeamClientAccess(db: DB, input: TeamAccessLogInput): Promise<void> {
    try {
        await db.from('team_access_logs').insert({
            team_id: input.teamId,
            actor_coach_id: input.actorCoachId,
            client_id: input.clientId,
            resource: input.resource,
            action: input.action,
            metadata: input.metadata ?? {},
        })
    } catch {
        // swallow: la bitacora es secundaria al acceso.
    }
}

export type TeamAuditEventInput = {
    teamId: string
    actorCoachId: string
    action: string
    targetType?: string | null
    targetId?: string | null
    metadata?: Json
}

/**
 * Bitacora de gobernanza del team (team_audit_logs, append-only). Espeja writeOrgAuditEvent.
 * Debe insertarse con cliente USER-scoped (actor_coach_id = auth.uid() + manager) para pasar RLS.
 */
export async function writeTeamAuditEvent(db: DB, e: TeamAuditEventInput): Promise<{ error?: string }> {
    const { error } = await db.from('team_audit_logs').insert({
        team_id: e.teamId,
        actor_coach_id: e.actorCoachId,
        action: e.action,
        target_type: e.targetType ?? null,
        target_id: e.targetId ?? null,
        metadata: e.metadata ?? {},
    })
    return error ? { error: error.message } : {}
}

export type TeamRow = {
    id: string
    name: string
    slug: string
    seat_limit: number
    owner_coach_id: string
    primary_color: string | null
    logo_url: string | null
}

export type TeamManagerContext = {
    supabase: DB
    admin: DB
    user: { id: string }
    team: TeamRow
    isOwner: boolean
}

/**
 * Resuelve el contexto de gestion del team para server actions de /coach/team.
 * - supabase: cliente USER-scoped (RLS + triggers de gobernanza son el techo real).
 * - admin: service-role (SOLO para crear cuentas auth/coaches; NO para mutar team_members,
 *   porque service_role BYPASEA los triggers de seat_limit/anti-escalacion).
 * requireOwner=true exige ser el owner (transferencia, can_manage). Si no, basta ser manager
 * (owner o can_manage). El RPC is_team_manager lee auth.uid() del cliente user-scoped.
 */
export async function resolveTeamManagerContext(
    teamId: string,
    opts?: { requireOwner?: boolean }
): Promise<{ error: string } | TeamManagerContext> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Vuelve a ingresar.' }

    const { data: team } = await supabase
        .from('teams')
        .select('id, name, slug, seat_limit, owner_coach_id, primary_color, logo_url')
        .eq('id', teamId)
        .is('deleted_at', null)
        .maybeSingle()
    if (!team) return { error: 'Equipo no encontrado.' }

    const isOwner = team.owner_coach_id === user.id
    if (opts?.requireOwner) {
        if (!isOwner) return { error: 'Solo el owner del equipo puede hacer esto.' }
    } else {
        const { data: isMgr } = await supabase.rpc('is_team_manager', { p_team_id: teamId })
        if (isMgr !== true) return { error: 'No tienes permisos de gestión en este equipo.' }
    }

    return { supabase, admin: createServiceRoleClient(), user: { id: user.id }, team, isOwner }
}
