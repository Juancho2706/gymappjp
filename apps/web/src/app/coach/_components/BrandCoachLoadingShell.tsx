import { getCoach } from '@/lib/coach/get-coach'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import { resolveBrandTheme, resolvePresetBranding, consolidateStandaloneBranding } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { parseLoaderConfig } from '@/lib/brand-composer'

/**
 * Azules "de sistema": ninguno identifica a un coach. `#1462DC` es el azul EVA
 * (`BRAND_PRIMARY_COLOR` = `SYSTEM_PRIMARY_COLOR` en `lib/brand-assets`), `#007AFF` el default
 * histórico del editor de Mi Marca y `#2563EB` el default de contraste de RN. ESPEJO de
 * `SYSTEM_BLUES` en `apps/mobile/lib/loader-identity.ts` (misma regla de producto, dos runtimes).
 */
const SYSTEM_BLUES = new Set(['#1462dc', '#2563eb', '#007aff'])

/** Tope del wordmark de marca; más largo que esto no entra en una línea del loader. */
const WORDMARK_MAX = 14

/** Color propio = hex válido que no sea uno de los azules de sistema. */
function isOwnBrandColor(color: string | null | undefined): boolean {
    const hex = (color ?? '').trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false
    return !SYSTEM_BLUES.has(hex)
}

/**
 * Wordmark presentable: colapsa espacios y, si el nombre completo no entra, se queda con la
 * PRIMERA palabra antes que con un recorte a media palabra ("Josefit Entrenamiento Personal" ⇒
 * "JOSEFIT"). Espejo de `fitLoaderWordmark` en `apps/mobile/lib/loader-identity.ts`.
 */
function fitWordmark(raw: string | null | undefined): string {
    const normalized = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (!normalized) return ''
    if (normalized.length <= WORDMARK_MAX) return normalized
    const first = normalized.split(' ')[0]
    return (first.length <= WORDMARK_MAX ? first : normalized.slice(0, WORDMARK_MAX)).trim()
}

/**
 * Loader del panel /coach (el fallback de los ~30 `loading.tsx` del panel). Se centra en el
 * ESCENARIO visible (viewport menos el topbar y el padding del contenido) con
 * `grid place-items-center` — antes quedaba anclado arriba porque el `min-h-dvh` desbordaba la
 * región de scroll bajo el topbar fijo.
 *
 * IDENTIDAD (regla del owner 2026-08-22, la MISMA que RN — `apps/mobile/lib/loader-identity.ts`):
 * hay marca cuando la cuenta muestra ALGO propio (color distinto del azul de sistema · logo
 * cargado · loader configurado). Si la hay, el loader es del coach AUNQUE `use_custom_loader` esté
 * apagado: ese toggle vive escondido en «Avanzado» y no puede tapar el logo de la marca en el panel
 * de su dueño (síntoma: «tengo Mi marca y sigo viendo EVA»). Si el coach SÍ configuró su loader
 * (texto propio, variante o compositor), se respeta lo que eligió, incluido «Sin ícono» y la figura
 * EVA. Un coach que nunca tocó nada sigue viendo la identidad EVA de siempre.
 */
export async function BrandCoachLoadingShell({
    children,
}: {
    children?: React.ReactNode
}) {
    const coach = await getCoach()
    // El layout principal ya gatea la marca, pero los loading.tsx se renderizan como
    // hermanos durante una navegación y no deben leer el payload crudo del coach.
    const brandingAllowed = isBrandingAllowed((coach?.subscription_tier ?? 'free') as SubscriptionTier)
    const brandOn = brandingAllowed && coach?.use_brand_colors_coach !== false
    // Preset-aware: si el coach eligió un tema curado, el color del loader sale del preset
    // (antes usaba primary_color CRUDO → el legacy naranja pisaba al tema elegido).
    const preset = brandOn && coach ? resolvePresetBranding(coach) : null
    const primaryColor = preset?.primary_color || coach?.primary_color || null

    // Acento RESUELTO por el motor de marca (OKLCH + clamp WCAG), no el hex crudo de DB: es el
    // mismo `brandTheme.light.accent` que emite `--theme-primary` en `coach/layout.tsx` y el que
    // usa el login del alumno, así el gradiente del wordmark no se desalinea del resto del panel.
    // (El loader toma SIEMPRE el acento claro, como el login: el gradiente se calcula de un solo hex.)
    const consolidated = preset && primaryColor ? consolidateStandaloneBranding(preset, primaryColor) : null
    const accent = brandOn && primaryColor
        ? resolveBrandTheme({
              brandColor: primaryColor,
              accentLight: consolidated?.accent_light || null,
              accentDark: consolidated?.accent_dark || null,
              secondaryLight: consolidated?.brand_secondary_color || null,
              secondaryDark: consolidated?.brand_secondary_color || null,
              neutralTint: consolidated?.neutral_tint === true,
          }).light.accent
        : null

    const logoUrl = brandOn ? coach?.logo_url?.trim() || null : null
    const logoDarkUrl = brandOn ? coach?.logo_url_dark?.trim() || null : null
    const loaderText = coach?.loader_text?.trim() ?? ''
    const hasCustomText = coach?.use_custom_loader === true && loaderText.length > 0
    const hasVariant = resolveLoaderVariant(preset?.loader_variant ?? coach?.loader_variant ?? null) !== 'eva'
    const hasComposite = parseLoaderConfig(coach?.loader_config ?? null) != null
    // «Configuró su loader» = tocó algo que SOLO se toca a propósito. `use_custom_loader` sin texto
    // no cuenta: es un switch que no cambia nada por sí solo.
    const configuredLoader = hasCustomText || hasVariant || hasComposite
    const branded = brandOn && (isOwnBrandColor(primaryColor) || Boolean(logoUrl) || configuredLoader)

    const iconModeRaw = coach?.loader_icon_mode
    // «Sin ícono» es una elección explícita y se respeta. «EVA» solo gana cuando el coach de verdad
    // configuró su loader; si nunca lo tocó, ese 'eva' es el default de un selector escondido.
    const showIcon = iconModeRaw !== 'none'
    const wantsEvaFigure = iconModeRaw === 'eva' && configuredLoader
    const iconMode: 'eva' | 'coach' | 'none' = !showIcon
        ? 'none'
        : logoUrl && !wantsEvaFigure
        ? 'coach'
        : 'eva'
    const wordmark = fitWordmark(hasCustomText ? loaderText : coach?.brand_name)

    return (
        <div className="grid w-full animate-in fade-in duration-300 place-items-center px-4 min-h-[calc(100dvh-var(--mobile-content-top-offset)-var(--mobile-content-bottom-offset)-3rem)] md:min-h-[calc(100dvh-60px-5rem)]">
            <div className="flex flex-col items-center justify-center py-2">
                {branded ? (
                    <EvaRouteLoader
                        size="lg"
                        className="py-1"
                        customText={wordmark || undefined}
                        /* `useCustom` acá significa «pintá el wordmark de la marca»: con marca y
                           sin nombre utilizable, cae solo al wordmark EVA. */
                        useCustom={Boolean(wordmark)}
                        /* W-brand B4: loader_text_color almacenado deja de leerse — el texto se
                           pinta con el gradiente derivado del primario (preset o legacy). */
                        primaryColor={accent ?? undefined}
                        iconMode={iconMode}
                        coachLogoUrl={logoUrl ?? undefined}
                        coachLogoDarkUrl={logoDarkUrl ?? undefined}
                    />
                ) : (
                    <EvaRouteLoader size="lg" className="py-1" iconMode="eva" showWordmark={false} />
                )}
            </div>
            {children}
        </div>
    )
}
