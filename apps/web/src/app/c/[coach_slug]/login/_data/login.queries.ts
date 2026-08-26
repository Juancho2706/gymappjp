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
        // W-brand B4: loader_text_color salió del select — el standalone no lo lee (nadie lo
        // consumía en este flujo; el color del texto del loader lo decide el motor de contraste).
        // FCN W2.8: +invite_code — el escape del desconocido («¿No tienes cuenta?») necesita el
        // código para linkear a `/join/{código}`. Ya está en el column-grant de `anon`
        // (`20260617033845_coaches_restrict_anon_select_to_branding.sql`), así que no arrastra
        // migración: el login del alumno sigue leyendo con la anon key como siempre.
        .select('brand_name, primary_color, logo_url, welcome_message, subscription_tier, brand_secondary_color, accent_light, accent_dark, logo_url_dark, brand_font_key, loader_variant, neutral_tint, theme_preset_key, login_layout_key, loader_config, use_custom_loader, loader_text, loader_icon_mode, invite_code')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<
        Coach,
        | 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message' | 'subscription_tier'
        | 'brand_secondary_color' | 'accent_light' | 'accent_dark' | 'logo_url_dark' | 'brand_font_key'
        | 'loader_variant' | 'neutral_tint' | 'theme_preset_key' | 'login_layout_key' | 'loader_config'
        | 'use_custom_loader' | 'loader_text' | 'loader_icon_mode' | 'invite_code'
    > | null
})
