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
    active_org_id: string | null
    use_brand_colors_coach?: boolean | null
    loader_text: string | null
    use_custom_loader: boolean | null
    loader_text_color: string | null
    loader_icon_mode: string | null
    onboarding_guide: unknown
}

export async function findCoachById(db: DB, coachId: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide')
        .eq('id', coachId)
        .maybeSingle()
    return data as CoachRow | null
}

export async function findCoachBySlug(db: DB, slug: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide')
        .eq('slug', slug)
        .maybeSingle()
    return data as CoachRow | null
}

export async function findCoachByInviteCode(db: DB, code: string): Promise<CoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, active_org_id, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, onboarding_guide')
        .eq('invite_code', code)
        .maybeSingle()
    return data as CoachRow | null
}
