import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type CoachRow = {
    id: string
    full_name: string | null
    brand_name: string | null
    slug: string | null
    invite_code: string | null
    primary_color: string | null
    logo_url: string | null
    subscription_status: string | null
    subscription_tier: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    active_org_id: string | null
    use_brand_colors_coach?: boolean | null
    loader_text: string | null
    use_custom_loader: boolean | null
    loader_text_color: string | null
    loader_icon_mode: string | null
    onboarding_guide: unknown
    // white-label v2
    brand_secondary_color: string | null
    accent_light: string | null
    accent_dark: string | null
    neutral_tint: boolean | null
    logo_url_dark: string | null
    brand_font_key: string | null
    loader_variant: string | null
    // white-label v2.1 (presets)
    theme_preset_key: string | null
    login_layout_key: string | null
    loader_config: unknown
    /** Alta del coach: decide el modal de código público (`needsPublicCodeConfirmation`). */
    created_at: string | null
}

export async function findCoachById(db: DB, coachId: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide, brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant, theme_preset_key, login_layout_key, loader_config, created_at')
        .eq('id', coachId)
        .maybeSingle()
    return data as CoachRow | null
}

export async function findCoachBySlug(db: DB, slug: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide, brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant, theme_preset_key, login_layout_key, loader_config, created_at')
        .eq('slug', slug)
        .maybeSingle()
    return data as CoachRow | null
}

export async function findCoachByInviteCode(db: DB, code: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide, brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant, theme_preset_key, login_layout_key, loader_config, created_at')
        .eq('invite_code', code)
        .maybeSingle()
    return data as CoachRow | null
}

function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null | undefined
): T {
    if (orgId === undefined) return query
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

/**
 * Total de alumnos del coach — KPI «Alumnos» del dashboard.
 *
 * `is_demo = false` (onboarding v2): el alumno de ejemplo se VE en el directorio con su etiqueta,
 * pero no infla el número que el coach lee como su cartera ni el que compara contra el cupo.
 */
export async function countCoachClients(db: DB, coachId: string, orgId?: string | null, teamId?: string | null): Promise<number> {
    let query = db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false)
        .eq('is_demo', false)
    if (teamId) {
        query = query.is('org_id', null).eq('team_id', teamId)
    } else {
        query = query.eq('coach_id', coachId)
        query = applyOrgScope(query, orgId)
        if (teamId !== undefined) query = query.is('team_id', null)
    }
    const { count } = await query

    return count ?? 0
}

export async function findCoachRecentClients(db: DB, coachId: string, limit = 5, orgId?: string | null, teamId?: string | null) {
    let query = db
        .from('clients')
        .select('id, full_name, email, created_at, onboarding_completed')
        .eq('is_archived', false)
    if (teamId) {
        query = query.is('org_id', null).eq('team_id', teamId)
    } else {
        query = query.eq('coach_id', coachId)
        query = applyOrgScope(query, orgId)
        if (teamId !== undefined) query = query.is('team_id', null)
    }
    const { data } = await query.order('created_at', { ascending: false }).limit(limit)

    return data ?? []
}

export async function findCoachClientSignupDates(db: DB, coachId: string, orgId?: string | null, teamId?: string | null, sinceIso?: string) {
    let query = db
        .from('clients')
        .select('created_at')
        .eq('is_archived', false)
    if (sinceIso) {
        query = query.gte('created_at', sinceIso)
    }
    if (teamId) {
        query = query.is('org_id', null).eq('team_id', teamId)
    } else {
        query = query.eq('coach_id', coachId)
        query = applyOrgScope(query, orgId)
        if (teamId !== undefined) query = query.is('team_id', null)
    }
    const { data } = await query

    return data ?? []
}
