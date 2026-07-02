import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>

export const getClientLoginMetadataCoach = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('brand_name, logo_url')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<Coach, 'brand_name' | 'logo_url'> | null
})

export const getClientLoginCoach = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        // white-label v2: +subscription_tier (gate) + campos v2 (color2/accent/logo dark/fuente).
        // white-label W1b: +theme_preset_key (galería de temas) + login_layout_key (variante de layout)
        // + loader_config (compositor de loader, para la variante "energia") + loader_variant/neutral_tint.
        .select('brand_name, primary_color, logo_url, welcome_message, subscription_tier, brand_secondary_color, accent_light, accent_dark, logo_url_dark, brand_font_key, loader_variant, neutral_tint, theme_preset_key, login_layout_key, loader_config, use_custom_loader, loader_text, loader_text_color, loader_icon_mode')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<
        Coach,
        | 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message' | 'subscription_tier'
        | 'brand_secondary_color' | 'accent_light' | 'accent_dark' | 'logo_url_dark' | 'brand_font_key'
        | 'loader_variant' | 'neutral_tint' | 'theme_preset_key' | 'login_layout_key' | 'loader_config'
        | 'use_custom_loader' | 'loader_text' | 'loader_text_color' | 'loader_icon_mode'
    > | null
})
