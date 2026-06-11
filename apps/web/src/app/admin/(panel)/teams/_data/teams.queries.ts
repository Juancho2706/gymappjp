import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type AdminTeamRow = {
    id: string
    name: string
    slug: string
    invite_code: string | null
    seat_limit: number
    owner_coach_id: string
    enabled_modules: Record<string, boolean>
    created_at: string | null
    ownerName: string | null
    memberCount: number
    clientCount: number
}

/** Lista de teams para el panel CEO (service-role; admin ya gateado en el layout). */
export async function getTeamsForAdmin(): Promise<AdminTeamRow[]> {
    const admin = createServiceRoleClient()

    const { data: teams } = await admin
        .from('teams')
        .select('id, name, slug, invite_code, seat_limit, owner_coach_id, enabled_modules, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (!teams?.length) return []

    const ids = teams.map(t => t.id)
    const ownerIds = Array.from(new Set(teams.map(t => t.owner_coach_id)))

    const [membersRes, clientsRes, ownersRes] = await Promise.all([
        admin.from('team_members').select('team_id').in('team_id', ids).eq('status', 'active').is('deleted_at', null),
        admin.from('clients').select('team_id').in('team_id', ids).eq('is_archived', false),
        admin.from('coaches').select('id, full_name, brand_name').in('id', ownerIds),
    ])

    const memberCounts: Record<string, number> = {}
    const clientCounts: Record<string, number> = {}
    const ownerNames: Record<string, string> = {}
    for (const m of membersRes.data ?? []) memberCounts[m.team_id] = (memberCounts[m.team_id] ?? 0) + 1
    for (const c of clientsRes.data ?? []) { if (c.team_id) clientCounts[c.team_id] = (clientCounts[c.team_id] ?? 0) + 1 }
    for (const o of ownersRes.data ?? []) ownerNames[o.id] = o.full_name || o.brand_name || 'Coach'

    return teams.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        invite_code: t.invite_code,
        seat_limit: t.seat_limit,
        owner_coach_id: t.owner_coach_id,
        enabled_modules: (t.enabled_modules && typeof t.enabled_modules === 'object'
            ? (t.enabled_modules as Record<string, boolean>)
            : {}),
        created_at: t.created_at,
        ownerName: ownerNames[t.owner_coach_id] ?? null,
        memberCount: memberCounts[t.id] ?? 0,
        clientCount: clientCounts[t.id] ?? 0,
    }))
}
