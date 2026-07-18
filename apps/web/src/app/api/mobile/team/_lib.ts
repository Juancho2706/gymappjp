import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Helper compartido de los endpoints mobile de gestion del team
 * (remove-member / set-manage / update-brand). Espeja resolveTeamManagerContext
 * (apps/web/.../services/team/team.service.ts) pero autenticando por BEARER (no cookie):
 *  - admin (service-role): getUser(token) autoritativo + lookup del team.
 *  - userClient (token-scoped, RLS): is_team_manager RPC + las mutaciones (para que disparen los
 *    triggers de gobernanza — seat_guard / anti-escalacion — que service_role bypasearia).
 * Toda mutacion => auth por getUser (revocation-sensitive), nunca por verificacion local de JWT.
 */

export function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/** Mapea mensajes crudos de triggers/constraints de DB a copy amigable en español. */
export function friendlyTeamError(msg: string | undefined): string {
    if (!msg) return 'No se pudo completar la acción. Intenta de nuevo.'
    if (msg.includes('seat_limit')) return 'Límite de cupos alcanzado. Pide al administrador ampliar el equipo.'
    if (msg.includes('owner')) return 'Esta acción solo la puede hacer el owner del equipo.'
    if (msg.includes('can_manage')) return 'Solo el owner puede cambiar los permisos de gestión.'
    if (msg.toLowerCase().includes('row-level security') || msg.includes('permission')) return 'No tienes permiso para esta acción.'
    if (msg.includes('duplicate key') || msg.includes('unique')) return 'Ese coach ya está en el equipo.'
    return 'No se pudo completar la acción. Intenta de nuevo.'
}

export type MobileTeamRow = {
    id: string
    name: string
    slug: string
    seat_limit: number
    owner_coach_id: string
}

export type MobileTeamManagerContext = {
    userId: string
    admin: SupabaseClient
    userClient: SupabaseClient
    team: MobileTeamRow
    isOwner: boolean
}

/**
 * Resuelve el contexto de gestion del team para un endpoint mobile. Devuelve `{ error }`
 * (NextResponse listo para retornar) o el contexto. `requireOwner` exige ser owner (permisos /
 * transferencia); si no, basta ser manager (owner o can_manage via is_team_manager).
 */
export async function resolveMobileTeamManager(
    request: NextRequest,
    teamId: string | null,
    opts?: { requireOwner?: boolean }
): Promise<{ error: NextResponse } | MobileTeamManagerContext> {
    const token = bearerToken(request)
    if (!token) return { error: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }) }

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return { error: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
    const userId = ud.user.id

    if (!teamId) return { error: NextResponse.json({ error: 'Datos inválidos' }, { status: 400 }) }

    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { data: team } = await admin
        .from('teams')
        .select('id, name, slug, seat_limit, owner_coach_id')
        .eq('id', teamId)
        .is('deleted_at', null)
        .maybeSingle()
    if (!team) return { error: NextResponse.json({ error: 'Equipo no encontrado.' }, { status: 404 }) }

    const isOwner = team.owner_coach_id === userId
    if (opts?.requireOwner) {
        if (!isOwner) return { error: NextResponse.json({ error: 'Solo el owner del equipo puede hacer esto.' }, { status: 403 }) }
    } else if (!isOwner) {
        const { data: isMgr } = await userClient.rpc('is_team_manager', { p_team_id: teamId })
        if (isMgr !== true) return { error: NextResponse.json({ error: 'No tienes permisos de gestión en este equipo.' }, { status: 403 }) }
    }

    return { userId, admin: admin as unknown as SupabaseClient, userClient, team: team as MobileTeamRow, isOwner }
}
