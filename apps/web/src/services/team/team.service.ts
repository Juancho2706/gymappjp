import type { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

type DB = Awaited<ReturnType<typeof createClient>>

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
