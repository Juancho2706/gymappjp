import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { resolvePresetBranding } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import type { Database, Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>

/**
 * SEC-01 fase 2 — única puerta ANÓNIMA al branding público de un coach.
 *
 * Antes cada superficie sin sesión (proxy `/c/**`, login del alumno, `/api/manifest`,
 * `/api/splash`, `/api/og`, `/api/pwa-screenshot`) hacía su propio
 * `from('coaches').select(…).eq('invite_code'|'slug', …)` con la anon key. Eso obligaba a mantener
 * `GRANT SELECT (invite_code)` para `anon` — y con `coaches_select_anon USING (true)` cualquiera
 * con la anon key (que viaja en el bundle) se bajaba los códigos de invitación de TODOS los coaches
 * de una sola request. Ahora todos pasan por el RPC `SECURITY DEFINER`
 * `public.get_coach_public_branding(text)` (migración `20260902014246`), que devuelve UNA fila.
 *
 * La bifurcación código-vs-slug vive DENTRO del RPC (mismo regex `^[A-Z2-9]{5}$` que
 * `coachIdentifierColumn()`), así que acá se le pasa el identificador crudo de la URL.
 */

/** Columnas que devuelve el RPC: exactamente las que `anon` puede leer de `coaches`. */
export type PublicCoachBranding = Pick<
    Coach,
    | 'id'
    | 'slug'
    | 'invite_code'
    | 'brand_name'
    | 'primary_color'
    | 'logo_url'
    | 'logo_url_dark'
    | 'welcome_message'
    | 'subscription_tier'
    | 'instagram_handle'
    | 'use_brand_colors_coach'
    | 'brand_secondary_color'
    | 'accent_light'
    | 'accent_dark'
    | 'neutral_tint'
    | 'brand_font_key'
    | 'theme_preset_key'
    | 'login_layout_key'
    | 'loader_variant'
    | 'loader_config'
    | 'use_custom_loader'
    | 'loader_text'
    | 'loader_text_color'
    | 'loader_icon_mode'
    | 'loader_show_icon'
    | 'executor_theme'
    | 'welcome_modal_enabled'
    | 'welcome_modal_content'
    | 'welcome_modal_type'
    | 'welcome_modal_version'
    | 'welcome_modal_updated_at'
>

/**
 * jsonb del RPC → fila tipada. `null` (coach inexistente) y cualquier payload que no sea un objeto
 * caen a `null`, igual que devolvía `.maybeSingle()` ante cero filas.
 */
export function mapPublicCoachBranding(payload: unknown): PublicCoachBranding | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    return payload as PublicCoachBranding
}

/**
 * Branding público por slug-o-código. Devuelve la misma forma `{ data, error }` que traía el
 * `.maybeSingle()` que reemplaza, para que los callers conserven su manejo de error/null.
 */
export async function fetchPublicCoachBranding(
    supabase: SupabaseClient<Database>,
    identifier: string,
): Promise<{ data: PublicCoachBranding | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.rpc('get_coach_public_branding', { p_identifier: identifier })
    if (error) return { data: null, error }
    return { data: mapPublicCoachBranding(data), error: null }
}

/**
 * Color de marca EFECTIVO de una superficie pública (white-label W1a).
 *
 * `coaches.primary_color` es el color LIBRE legacy: desde que existe el catálogo curado
 * (`theme_preset_key`), la columna cruda queda como GRANDFATHER y ya no es lo que ve el alumno —
 * `resolvePresetBranding` la pisa con el color del preset. El layout `/c` y el login ya lo
 * resolvían así; las superficies que leían la columna/el header CRUDO (loader de ruta, manifest,
 * splash, theme-color del viewport) pintaban el color viejo del coach y quedaban fuera de tono
 * con la app — bug del owner 2026-09-02: `josefit` (preset `sport-blue` = #2563EB) mostraba un
 * loader NARANJA porque su `primary_color` legacy sigue siendo #F97316.
 *
 * Reglas (espejo exacto del layout `/c` y de `resolveEffectiveCoachBrandTheme` en RN):
 * - Tier inválido/stale (`isBrandingAllowed` fail-closed) ⇒ azul de sistema.
 * - `managed` (marca de org/team, `x-workspace-brand-source` = organization|orphan) ⇒ el preset
 *   NO aplica: es PERSONAL del coach y la marca gestionada debe ganar.
 * - Sin preset (o key desconocida) ⇒ passthrough del color libre legacy.
 */
export type EffectiveBrandColorInput = {
    /** `coaches.primary_color` crudo (columna legacy) o el header `x-coach-primary-color`. */
    primaryColor?: string | null
    /** `coaches.theme_preset_key` o el header `x-coach-theme-preset-key`. */
    themePresetKey?: string | null
    /** `coaches.subscription_tier` o el header `x-coach-subscription-tier`. */
    subscriptionTier?: string | null
    /** Marca gestionada por org/team: el preset personal del coach no aplica. */
    managed?: boolean
}

export function resolveEffectiveBrandColor(
    input: EffectiveBrandColorInput | null | undefined,
): string {
    if (!input) return SYSTEM_PRIMARY_COLOR
    if (!isBrandingAllowed((input.subscriptionTier ?? 'free') as SubscriptionTier)) {
        return SYSTEM_PRIMARY_COLOR
    }
    const resolved = resolvePresetBranding({
        theme_preset_key: input.managed ? null : (input.themePresetKey ?? null),
        primary_color: input.primaryColor ?? null,
    })
    return resolved.primary_color?.trim() || SYSTEM_PRIMARY_COLOR
}
