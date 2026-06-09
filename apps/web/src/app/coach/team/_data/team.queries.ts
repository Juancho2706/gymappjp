import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type TeamMemberView = {
    id: string
    coach_id: string
    display_role: string | null
    can_manage: boolean
    name: string
}

export type TeamOverview = {
    id: string
    name: string
    slug: string
    seat_limit: number
    owner_coach_id: string
    members: TeamMemberView[]
    activeMemberCount: number
    poolClientCount: number
}

/**
 * Overview del/los team(s) del coach actual para la pagina "Mi Equipo".
 * Cliente user-scoped -> RLS es el techo: `teams` devuelve solo los teams donde el
 * coach es miembro (team_teams_member_select); `team_members`/`clients` igual.
 */
export const getCoachTeamOverview = cache(async (): Promise<{ userId: string | null; teams: TeamOverview[] }> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { userId: null, teams: [] }

    const { data: teams } = await supabase
        .from('teams')
        .select('id, name, slug, seat_limit, owner_coach_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

    if (!teams || teams.length === 0) return { userId: user.id, teams: [] }

    const overviews = await Promise.all(
        teams.map(async (t): Promise<TeamOverview> => {
            const [membersRes, poolRes] = await Promise.all([
                supabase
                    .from('team_members')
                    .select('id, coach_id, display_role, can_manage, joined_at, coaches(full_name, brand_name)')
                    .eq('team_id', t.id)
                    .eq('status', 'active')
                    .is('deleted_at', null)
                    .order('joined_at', { ascending: true }),
                supabase
                    .from('clients')
                    .select('id', { count: 'exact', head: true })
                    .eq('team_id', t.id)
                    .eq('is_archived', false),
            ])

            const members: TeamMemberView[] = (membersRes.data ?? []).map((m) => {
                const rel = (m as { coaches?: unknown }).coaches
                const c = (Array.isArray(rel) ? rel[0] : rel) as { full_name?: string | null; brand_name?: string | null } | null
                return {
                    id: m.id,
                    coach_id: m.coach_id,
                    display_role: m.display_role,
                    can_manage: m.can_manage,
                    name: c?.brand_name || c?.full_name || 'Coach',
                }
            })

            return {
                id: t.id,
                name: t.name,
                slug: t.slug,
                seat_limit: t.seat_limit,
                owner_coach_id: t.owner_coach_id,
                members,
                activeMemberCount: members.length,
                poolClientCount: poolRes.count ?? 0,
            }
        })
    )

    return { userId: user.id, teams: overviews }
})
