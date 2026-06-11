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
    invite_code: string | null
    primary_color: string | null
    logo_url: string | null
    logo_url_dark: string | null
    accent_light: string | null
    accent_dark: string | null
    neutral_tint: boolean
    splash_bg_color: string | null
    loader_text: string | null
    loader_text_color: string | null
    loader_icon_mode: string
    use_custom_loader: boolean
    enabled_modules: Record<string, boolean>
    members: TeamMemberView[]
    activeMemberCount: number
    poolClientCount: number
    isOwner: boolean
    isManager: boolean
}

/**
 * Overview del team ACTIVO para la pagina "Mi Equipo" (modulo exclusivo del contexto coach_team).
 * `activeTeamId` viene del workspace activo: un coach en dos pools solo ve el del contexto actual.
 * Cliente user-scoped -> RLS es el techo: `teams` devuelve solo teams donde el coach es miembro.
 */
export const getCoachTeamOverview = cache(async (activeTeamId: string): Promise<{ userId: string | null; teams: TeamOverview[] }> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { userId: null, teams: [] }

    const { data: teams } = await supabase
        .from('teams')
        .select('id, name, slug, seat_limit, owner_coach_id, invite_code, primary_color, logo_url, logo_url_dark, accent_light, accent_dark, neutral_tint, splash_bg_color, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, enabled_modules')
        .eq('id', activeTeamId)
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

            const isOwner = t.owner_coach_id === user.id
            const isManager = isOwner || (members.find((m) => m.coach_id === user.id)?.can_manage ?? false)

            return {
                id: t.id,
                name: t.name,
                slug: t.slug,
                seat_limit: t.seat_limit,
                owner_coach_id: t.owner_coach_id,
                invite_code: t.invite_code,
                primary_color: t.primary_color,
                logo_url: t.logo_url,
                logo_url_dark: t.logo_url_dark,
                accent_light: t.accent_light,
                accent_dark: t.accent_dark,
                neutral_tint: t.neutral_tint,
                splash_bg_color: t.splash_bg_color,
                loader_text: t.loader_text,
                loader_text_color: t.loader_text_color,
                loader_icon_mode: t.loader_icon_mode,
                use_custom_loader: t.use_custom_loader,
                enabled_modules: (t.enabled_modules && typeof t.enabled_modules === 'object'
                    ? (t.enabled_modules as Record<string, boolean>)
                    : {}),
                members,
                activeMemberCount: members.length,
                poolClientCount: poolRes.count ?? 0,
                isOwner,
                isManager,
            }
        })
    )

    return { userId: user.id, teams: overviews }
})
