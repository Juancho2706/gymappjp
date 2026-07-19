import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import { findCoachById } from '@/infrastructure/db'
import { countActiveStandaloneClients } from '@/services/billing/capacity.service'

export type CoachSession = Pick<
    Tables<'coaches'>,
    | 'id'
    | 'active_org_id'
    | 'max_clients'
    | 'full_name'
    | 'brand_name'
    | 'subscription_status'
    | 'primary_color'
    | 'slug'
    | 'invite_code'
    | 'loader_text'
    | 'use_custom_loader'
    | 'loader_text_color'
    | 'loader_icon_mode'
    | 'logo_url'
    | 'onboarding_guide'
    | 'subscription_tier'
    | 'brand_secondary_color'
    | 'accent_light'
    | 'accent_dark'
    | 'neutral_tint'
    | 'logo_url_dark'
    | 'brand_font_key'
    | 'loader_variant'
    // white-label v2.1 (presets): key del tema + slots crudos (render por otro agente).
    | 'theme_preset_key'
    | 'login_layout_key'
    | 'loader_config'
> & {
    use_brand_colors_coach?: boolean
}

/**
 * Cached per request to avoid duplicated auth + coach lookup across layout/page.
 */
export const getCoach = cache(async (): Promise<CoachSession | null> => {
    const supabase = await createClient()
    // getClaims(): verificación LOCAL del JWT (llaves asimétricas ES256 + JWKS cacheado), sin
    // round-trip a GoTrue /user. Solo necesitamos el id del coach para el lookup — es lectura de
    // página, no un boundary de mutación, así que no requiere accuracy de revocación.
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    if (!userId) {
        return null
    }

    // findCoachById (repository) no incluye max_clients; se lee en paralelo para el gate de
    // sobre-límite del plan standalone (el override manual del cupo prima sobre el del tier).
    const [row, capRes] = await Promise.all([
        findCoachById(supabase, userId),
        supabase.from('coaches').select('max_clients').eq('id', userId).maybeSingle(),
    ])
    if (!row) return null
    return { ...row, max_clients: capRes.data?.max_clients ?? null } as CoachSession
})

/**
 * Conteo de alumnos activos standalone del coach, memoizado por request (React.cache) para
 * deduplicar entre el layout /coach (banner global de sobre-límite) y el dashboard.
 */
export const getActiveStandaloneClientCount = cache(async (coachId: string): Promise<number> => {
    const supabase = await createClient()
    return countActiveStandaloneClients(supabase, coachId)
})
