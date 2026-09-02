import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicCoachBranding } from '@/lib/branding/public-branding'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>

/**
 * SEC-01 fase 2: el login del alumno es PRE-AUTH (lee como `anon`), así que ya no consulta
 * `coaches` directo — pasa por el RPC `get_coach_public_branding`, que resuelve slug-o-código
 * adentro y devuelve UNA fila. `cache()` de React deja una sola llamada por request aunque la
 * pidan el `generateMetadata` y la página.
 */
const getPublicBranding = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data } = await fetchPublicCoachBranding(supabase, coachSlug)
    return data
})

export const getClientLoginMetadataCoach = cache(async (coachSlug: string) => {
    const coach = await getPublicBranding(coachSlug)
    if (!coach) return null

    return { brand_name: coach.brand_name, logo_url: coach.logo_url } as Pick<Coach, 'brand_name' | 'logo_url'>
})

export const getClientLoginCoach = cache(async (coachSlug: string) => {
    const coach = await getPublicBranding(coachSlug)
    if (!coach) return null

    // white-label v2: +subscription_tier (gate) + campos v2 (color2/accent/logo dark/fuente).
    // white-label W1b: +theme_preset_key (galería de temas) + login_layout_key (variante de layout)
    // + loader_config (compositor de loader, para la variante "energia") + loader_variant/neutral_tint.
    // W-brand B4: loader_text_color NO se lee — el standalone no lo consume (el color del texto del
    // loader lo decide el motor de contraste), aunque el RPC lo devuelva.
    // FCN W2.8: +invite_code — el escape del desconocido («¿No tienes cuenta?») necesita el código
    // para linkear a `/join/{código}`.
    return {
        brand_name: coach.brand_name,
        primary_color: coach.primary_color,
        logo_url: coach.logo_url,
        welcome_message: coach.welcome_message,
        subscription_tier: coach.subscription_tier,
        brand_secondary_color: coach.brand_secondary_color,
        accent_light: coach.accent_light,
        accent_dark: coach.accent_dark,
        logo_url_dark: coach.logo_url_dark,
        brand_font_key: coach.brand_font_key,
        loader_variant: coach.loader_variant,
        neutral_tint: coach.neutral_tint,
        theme_preset_key: coach.theme_preset_key,
        login_layout_key: coach.login_layout_key,
        loader_config: coach.loader_config,
        use_custom_loader: coach.use_custom_loader,
        loader_text: coach.loader_text,
        loader_icon_mode: coach.loader_icon_mode,
        invite_code: coach.invite_code,
    } as Pick<
        Coach,
        | 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message' | 'subscription_tier'
        | 'brand_secondary_color' | 'accent_light' | 'accent_dark' | 'logo_url_dark' | 'brand_font_key'
        | 'loader_variant' | 'neutral_tint' | 'theme_preset_key' | 'login_layout_key' | 'loader_config'
        | 'use_custom_loader' | 'loader_text' | 'loader_icon_mode' | 'invite_code'
    >
})
