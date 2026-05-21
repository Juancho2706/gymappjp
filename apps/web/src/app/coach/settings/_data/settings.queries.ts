import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'

export type CoachSettingsRow = Tables<'coaches'>

export const getCoachSettingsForUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null }

    const { data: rawCoach } = await supabase
        .from('coaches')
        .select('id, full_name, brand_name, slug, invite_code, slug_changed_at, primary_color, logo_url, welcome_message, welcome_modal_content, welcome_modal_enabled, welcome_modal_type, welcome_modal_updated_at, welcome_modal_version, loader_text, loader_text_color, loader_icon_mode, loader_show_icon, use_custom_loader, onboarding_guide, subscription_tier, subscription_status, subscription_mp_id, superseded_mp_preapproval_id, billing_cycle, current_period_end, trial_ends_at, trial_used_email, payment_provider, max_clients, marketing_consent, previous_slugs, use_brand_colors_coach, admin_notes, health_data_consent_at, updated_at, created_at')
        .eq('id', user.id)
        .maybeSingle()

    return { user, coach: rawCoach as CoachSettingsRow | null }
})
