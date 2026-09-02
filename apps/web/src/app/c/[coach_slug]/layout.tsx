import { Suspense } from 'react'
import { headers } from 'next/headers'
import { decodeBrandHeaderValue } from '@/lib/brand-header-codec'
import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import {
    BRAND_APP_ICON,
    SYSTEM_PRIMARY_COLOR,
    BRAND_PRIMARY_COLOR,
} from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
import { COACH_OG_IMAGE_HEIGHT, COACH_OG_IMAGE_WIDTH, coachOgImageVersion } from '@/lib/coach-og-image'
import { ClientNavGates } from './_components/ClientNavGates'
import { ClientNavFallback } from './_components/ClientNavFallback'
import { BasePathProvider } from '@/components/client/BasePathProvider'
import { WorkoutLaunchProvider } from './dashboard/_components/launch/WorkoutLaunchMorph'
import { NetworkProvider } from '@/components/client/OfflineScreen'
import { OfflineNutritionQueueSync } from '@/app/c/[coach_slug]/_components/OfflineNutritionQueueSync'
import { OfflineWorkoutQueueSync } from '@/app/c/[coach_slug]/_components/OfflineWorkoutQueueSync'
import { generateBrandPalette } from '@/lib/color-utils'
import { resolveBrandTheme, deriveSportTokens, resolvePresetBranding, consolidateStandaloneBranding } from '@eva/brand-kit'
import { isBrandingAllowed, showsEvaBadge, type SubscriptionTier } from '@eva/tiers'
import { EvaBadge } from '@/components/brand/EvaBadge'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { buildSealCssVars } from '@/lib/seal-vars'
import { AppSeal } from '@/components/AppSeal'
import { STUDENT_ACCESS_COPY, STUDENT_ACCESS_STATE_HEADER } from '@/lib/student-access'
import { parseVtaMode, VTA_CLIENT_IS_DEMO_HEADER, VTA_MODE_HEADER } from '@/lib/auth/vive-tu-app-cookies'
import { DemoViewerBanner } from './_components/DemoViewerBanner'
import { IdentifyStudentOnMount } from '@/components/analytics/IdentifyStudentOnMount'
import { getClientRootUser } from './_data/client-root.queries'

interface Props {
    children: React.ReactNode
    params: Promise<{ coach_slug: string }>
}

// Apple PWA splash screens (device CSS px + pixel ratio → physical px for the image).
// Generated white-label per coach/org via /api/splash/[slug]. Free (native next/og).
const APPLE_SPLASH: { dw: number; dh: number; r: number }[] = [
    { dw: 320, dh: 568, r: 2 }, // SE 1
    { dw: 375, dh: 667, r: 2 }, // 8 / SE 2-3
    { dw: 414, dh: 736, r: 3 }, // 8 Plus
    { dw: 375, dh: 812, r: 3 }, // X / 11 Pro / 12 mini
    { dw: 414, dh: 896, r: 2 }, // XR / 11
    { dw: 414, dh: 896, r: 3 }, // XS Max / 11 Pro Max
    { dw: 390, dh: 844, r: 3 }, // 12 / 13 / 14
    { dw: 428, dh: 926, r: 3 }, // 12/13 Pro Max
    { dw: 393, dh: 852, r: 3 }, // 14 Pro / 15
    { dw: 430, dh: 932, r: 3 }, // 14/15 Pro Max
    { dw: 768, dh: 1024, r: 2 }, // iPad
]

/**
 * apple-touch-icon debe ser un raster (PNG/JPG). iOS IGNORA SVG/WebP/AVIF y los data: URIs
 * (por eso el favicon SVG generado no sirve como ícono de instalación). Servimos el logo del
 * coach directo cuando el formato sirve; si no (o sin logo) → ícono EVA (PNG). NO reescalamos
 * server-side: un logo NO cuadrado sale recortado por iOS. Cierre completo del gap = un endpoint
 * tipo `/api/splash` que renderice un PNG 180×180 por coach (fuera de W2, anotado).
 */
function appleTouchIconFor(logoUrl: string | null | undefined): string {
    if (!logoUrl) return BRAND_APP_ICON
    const lower = logoUrl.toLowerCase()
    if (lower.startsWith('data:') || /\.(svg|webp|avif)(\?|$)/.test(lower)) return BRAND_APP_ICON
    return logoUrl
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    // Read branding from middleware headers — no extra DB query needed
    const headersList = await headers()
    const brandName = decodeBrandHeaderValue(headersList.get('x-coach-brand-name')) ?? 'Mi Coach'
    const logoUrl = headersList.get('x-coach-logo-url') || null
    const logoUrlDark = headersList.get('x-coach-logo-url-dark') || null
    const primaryColor = headersList.get('x-coach-primary-color') || null
    // El tier entra en la versión del og: es la única entrada del arte que no viaja en los headers
    // de marca (`isBrandingAllowed` fail-closed ⇒ preview de EVA en vez de la del coach).
    const subscriptionTier = headersList.get('x-coach-subscription-tier') || null

    const metadataBase = resolveMetadataBase()
    // OG por coach (22-08, pedido del owner): la preview de WhatsApp del link de acceso mostraba
    // el logo de EVA para cualquier coach. `api/og/[coach_slug]` dibuja SOLO el logo del coach
    // sobre su color de marca (owner 02-09). 1200×630 = el tamaño que WhatsApp/Meta recortan
    // menos; la imagen estática 1920×1080 queda como fallback del resto del sitio.
    //
    // El `?v=` es la ÚNICA forma de invalidar la miniatura: WhatsApp cachea la preview por URL, en
    // el teléfono del que comparte, 72 h o más, y no existe herramienta oficial para limpiarla. La
    // versión sale de las MISMAS entradas que el route dibuja (logo, logo dark, color, nombre) más
    // el tier, así que cambia justo cuando cambia el arte y no antes. El route ignora el query.
    //
    // LÍMITE DECLARADO (hallazgo B-8): acá las partes salen de los HEADERS del proxy y el route las
    // lee del RPC `get_coach_public_branding`. Casi siempre coinciden, pero no son la misma fuente:
    // el proxy rellena con `BRAND_APP_ICON` cuando el coach no tiene logo, y en el camino de team el
    // header trae el logo del TEAM mientras el route resuelve el del coach. Un cambio de arte que no
    // moviera ningún header dejaría la miniatura vieja pegada 72 h. Cerrarlo pide consultar el mismo
    // RPC desde `generateMetadata` (query extra por request en la ruta más caliente del portal): no
    // se paga hoy; el impacto es cosmético y acotado a esa ventana.
    const openGraphImageVersion = coachOgImageVersion(logoUrl, logoUrlDark, primaryColor, brandName, subscriptionTier)
    const openGraphImageAbsoluteUrl = new URL(`/api/og/${coach_slug}?v=${openGraphImageVersion}`, metadataBase).href
    const coachPath = `/c/${coach_slug}`
    const pageUrl = new URL(coachPath, metadataBase).href

    return {
        metadataBase,
        title: {
            default: brandName,
            template: `%s | ${brandName}`,
        },
        description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
        // NOTE: the manifest <link> is injected RAW in the layout JSX (not via this
        // `manifest:` field) so it can carry crossOrigin="use-credentials". Without
        // credentials the browser fetches /api/manifest/[slug] cookieless → getUser()
        // is null → the route falls back to the bare coach brand and start_url/scope
        // collapse to /c, defeating the team (/t) manifest branding.
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: logoUrl
            ? {
                icon: [{ url: logoUrl }],
                shortcut: [{ url: logoUrl }],
                // apple-touch-icon = raster PNG/JPG del coach o EVA (iOS ignora SVG/WebP).
                apple: [{ url: appleTouchIconFor(logoUrl) }],
            }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
        openGraph: {
            title: brandName,
            description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
            url: pageUrl,
            siteName: brandName,
            images: [
                {
                    url: openGraphImageAbsoluteUrl,
                    // og:image:secure_url — Meta lo lee históricamente en páginas https y algunos
                    // clientes prefieren ese sobre og:image. Misma URL (el sitio es https).
                    secureUrl: openGraphImageAbsoluteUrl,
                    width: COACH_OG_IMAGE_WIDTH,
                    height: COACH_OG_IMAGE_HEIGHT,
                    alt: brandName,
                    type: 'image/png',
                },
            ],
            locale: 'es_ES',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: brandName,
            description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
            images: [openGraphImageAbsoluteUrl],
        },
    }
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
    const { coach_slug } = await params
    const headersList = await headers()
    
    // Use the same logic as the main layout to get the primary color
    const primaryColor = headersList.get('x-coach-primary-color') ?? BRAND_PRIMARY_COLOR
    
    return {
        themeColor: primaryColor,
    }
}

export default async function ClientBrandLayout({ children, params }: Props) {
    const { coach_slug } = await params
    const headersList = await headers()

    // Branding desde los headers del proxy (`proxy.ts`).
    // Pricing v3 (owner 2026-08-21): el white-label es de TODOS los planes — Free incluido. Lo que
    // distingue a Free/Starter es el sello «Hecho con EVA» del footer (`showsEvaBadge`), no la marca.
    const subscriptionTier = (headersList.get('x-coach-subscription-tier') ?? 'free') as SubscriptionTier
    // `brandLocked` = red de seguridad FAIL-CLOSED de `isBrandingAllowed`: solo cae acá un tier
    // inválido/stale (fila corrupta, valor desconocido). En ese caso servimos skin EVA entero.
    const brandLocked = !isBrandingAllowed(subscriptionTier)
    // W1a — tema preset curado: si el coach eligió un preset (theme_preset_key),
    // sus valores (color/color2/accent/tinte/fuente/loader) OVERRIDEAN los crudos ANTES de derivar
    // tokens. NULL/desconocida → passthrough intacto (grandfather del color libre legacy).
    // El preset es PERSONAL del coach: NO se aplica cuando la marca viene de una org/team o el
    // alumno es huérfano (esas superficies ya traen su propio color por header y deben ganar).
    const brandSource = headersList.get('x-workspace-brand-source')
    const isManagedBrand = brandSource === 'organization' || brandSource === 'orphan'
    const preset = resolvePresetBranding({
        theme_preset_key: (brandLocked || isManagedBrand) ? null : headersList.get('x-coach-theme-preset-key'),
        primary_color: headersList.get('x-coach-primary-color'),
        brand_secondary_color: headersList.get('x-coach-secondary-color'),
        accent_light: headersList.get('x-coach-accent-light'),
        accent_dark: headersList.get('x-coach-accent-dark'),
        neutral_tint: headersList.get('x-coach-neutral-tint') === 'true',
        brand_font_key: headersList.get('x-coach-font-key'),
        loader_variant: headersList.get('x-coach-loader-variant'),
    })
    const primaryColor = brandLocked
        ? SYSTEM_PRIMARY_COLOR
        : (preset.primary_color ?? BRAND_PRIMARY_COLOR)
    // W-brand B2 (dueño 2026-08-17): consolidación de color SOLO para el coach STANDALONE —
    // sin preset (legacy custom), el secundario resuelto = sealPair(primario).secondary y los
    // brand_secondary_color/accent_* almacenados dejan de leerse. Con preset, passthrough
    // (el catálogo ya pisaba). Managed (org/team/orphan) conserva su camino actual hasta W3.
    const consolidatedBrand = (brandLocked || isManagedBrand)
        ? preset
        : consolidateStandaloneBranding(preset, primaryColor)
    const logoUrl = brandLocked
        ? BRAND_APP_ICON
        : (headersList.get('x-coach-logo-url') || BRAND_APP_ICON)
    const brandName = decodeBrandHeaderValue(headersList.get('x-coach-brand-name')) ?? 'Mi Coach'
    // Gate de suscripcion del coach (politica CEO 2026-07-18): el branch `/c` del proxy setea
    // `x-student-access-state` en 'grace' (ventana de 7 dias post period_end — alumno 100% funcional,
    // banner discreto) o 'readonly' (post-gracia: el proxy sirve SOLO las superficies de lectura —
    // plan/historial/rachas — y esta pagina muestra el banner honesto persistente; las escrituras
    // rebotan en actions/RLS con COACH_ACCOUNT_PAUSED). Fail-quiet: header ausente => sin banner
    // (tambien cubre el kill-switch STUDENT_ACCESS_GATE apagado — el proxy no manda nada). Sin
    // countdown para el alumno por decision CEO; la presion vive en el dashboard del COACH.
    const studentAccessState = headersList.get(STUDENT_ACCESS_STATE_HEADER)
    const isStudentGrace = studentAccessState === 'grace'
    const isStudentReadonly = studentAccessState === 'readonly'
    // B-9: enterprise client whose coach left the org — show a reassignment prompt.
    const isOrphan = headersList.get('x-workspace-orphan') === 'true'
    const orphanOrgName = decodeBrandHeaderValue(headersList.get('x-orphan-org-name')) ?? ''
    const coachId = headersList.get('x-coach-id') ?? ''
    // Sesión del alumno de EJEMPLO = el coach mirando su propia app (docs/specs/vive-tu-app-directo
    // §3). El proxy setea estos headers SIEMPRE en la rama `/c` (vacíos cuando no aplica), así que
    // nadie los puede falsificar mandándolos a mano. El nav usa el modo para reetiquetar «Cerrar
    // sesión»: el gesto obvio no puede quemar el camino de vuelta.
    const isDemoViewer = headersList.get(VTA_CLIENT_IS_DEMO_HEADER) === '1'
    const demoMode = isDemoViewer ? parseVtaMode(headersList.get(VTA_MODE_HEADER)) : null
    // Ejecutor V3 (E0.7) — preferencia de tema del ejecutor del alumno. Se EXPONE en el árbol /c
    // (data-executor-theme) para que la Ola 2 lo lea; hoy nada lo consume visualmente. No gateado
    // por tier (es una preferencia, no branding). Fail-safe: valor desconocido/ausente => 'coach'.
    const executorThemeRaw = headersList.get('x-coach-executor-theme')
    const executorTheme = executorThemeRaw === 'eva' ? 'eva' : 'coach'
    const loaderText = brandLocked ? '' : (decodeBrandHeaderValue(headersList.get('x-coach-loader-text')) ?? '')
    const useCustomLoader = !brandLocked && headersList.get('x-coach-use-custom-loader') === 'true'
    // W-brand B4: el standalone deja de leer loader_text_color (el texto del loader se pinta con
    // el gradiente derivado del primario). Managed (org/team) mantiene su camino actual hasta W3.
    const loaderTextColor = (brandLocked || !isManagedBrand) ? undefined : (headersList.get('x-coach-loader-text-color') ?? undefined)
    const loaderIconModeRaw = headersList.get('x-coach-loader-icon-mode') ?? 'eva'
    const loaderIconMode = brandLocked
        ? 'eva'
        : (loaderIconModeRaw === 'coach' || loaderIconModeRaw === 'none') ? loaderIconModeRaw : 'eva'
    // white-label v2 — fuente curada + variante de loader + logo dark (solo caen a EVA si `brandLocked`).
    const fontKey = brandLocked ? '' : (preset.brand_font_key ?? '')
    const brandFontStack = resolveBrandFontStack(fontKey) // server-side; nunca el string crudo del coach
    const loaderVariant = brandLocked ? 'eva' : resolveLoaderVariant(preset.loader_variant)
    const logoUrlDark = brandLocked ? '' : (headersList.get('x-coach-logo-url-dark') || '')

    // Hardening anti stored-XSS: estos valores los fija un org_admin/co-gestor de team al
    // editar su marca y se inyectan crudos en un <style>. Las comillas simples se escapan,
    // pero un `</style>` cerraría el elemento raw-text y permitiría inyectar tags/script.
    // Como son valores de string CSS, los < > nunca son legítimos: los removemos (mata el
    // breakout) y mantenemos el escape de comilla simple. (2da capa; los write paths validan).
    const sanitizeCssStringValue = (v: string) =>
        v.replace(/[<>]/g, '').replace(/'/g, "\\'")
    // El color además debe ser un hex válido; si no, cae al string vacío (sin color custom).
    const safeLoaderTextColor = loaderTextColor && /^#[0-9a-fA-F]{3,8}$/.test(loaderTextColor)
        ? loaderTextColor
        : ''
    const safeLoaderText = sanitizeCssStringValue(loaderText || '')
    // Loader COMPUESTO (loader_config jsonb): viaja como JSON string y se emite como CSS var
    // pa' que EvaRouteLoader lo lea post-mount. Solo se acepta JSON válido con shape esperado.
    const loaderConfigRaw = brandLocked ? '' : (decodeBrandHeaderValue(headersList.get('x-coach-loader-config')) ?? '')
    const safeLoaderConfig = (() => {
        if (!loaderConfigRaw) return ''
        try {
            const parsed = JSON.parse(loaderConfigRaw)
            if (!parsed || typeof parsed !== 'object' || typeof parsed.symbol !== 'string' || typeof parsed.animation !== 'string') return ''
            return sanitizeCssStringValue(JSON.stringify(parsed))
        } catch { return '' }
    })()

    // Per-mode white-label accent (org-driven). brand-kit resolves a readable
    // light + dark accent from the brand color + optional per-mode overrides.
    // W-brand B2: para standalone estos valores ya vienen consolidados (legacy custom ⇒
    // accents null + secundario derivado del primario); managed pasa intacto.
    const accentLight = brandLocked ? null : (consolidatedBrand.accent_light || null)
    const accentDark = brandLocked ? null : (consolidatedBrand.accent_dark || null)
    const neutralTint = !brandLocked && consolidatedBrand.neutral_tint === true
    // color2 (white-label v2): un color → clampeado por-modo a accent2 (legible en ambos).
    const secondaryColor = brandLocked ? null : (consolidatedBrand.brand_secondary_color || null)
    const brandTheme = resolveBrandTheme({ brandColor: primaryColor, accentLight, accentDark, neutralTint, secondaryLight: secondaryColor, secondaryDark: secondaryColor })

    // Generate full brand palette (derived shades) from the resolved light accent + secondary.
    const palette = generateBrandPalette(brandTheme.light.accent, brandTheme.light.accent2)
    // D2 white-label: rampa SPORT derivada (--sport-100..700 + cta-fill + focus-ring) del color de marca.
    const sportTokens = deriveSportTokens(primaryColor)
    // Sello EVA v2 (SPEC eva-seal-background D3): par del sello por modo desde el tema
    // RESUELTO, publicado como --seal-p-rgb/--seal-s-rgb junto a --theme-*. Modo estricto
    // de sealPair — la key del preset viaja con el MISMO gating que `preset` arriba:
    // managed/free ⇒ null ⇒ par derivado del primario (regla B2: el secundario suelto
    // de un legacy no pinta el sello).
    const sealVars = buildSealCssVars({
        lightBrandColor: brandTheme.light.accent,
        darkBrandColor: brandTheme.dark.accent,
        themePresetKey: (brandLocked || isManagedBrand) ? null : headersList.get('x-coach-theme-preset-key'),
    })
    const lightAccent = brandTheme.light.accent
    const lightOnAccent = brandTheme.light.accentText
    const darkAccent = brandTheme.dark.accent
    const darkOnAccent = brandTheme.dark.accentText
    const lightAccent2 = brandTheme.light.accent2
    const lightOnAccent2 = brandTheme.light.accent2Text
    const darkAccent2 = brandTheme.dark.accent2
    const darkOnAccent2 = brandTheme.dark.accent2Text

    // Generate fallback favicon SVG (initial + color) if no logo
    const faviconUrl = logoUrl || generateFaviconSvg(brandName, primaryColor)

    // F2: in-app link prefix. The proxy sets x-client-base-path when serving this tree under the
    // enterprise area (/e/[org_slug] → rewrite → /c/[coach_slug]); otherwise it's the standalone
    // /c path. Default keeps /c/* byte-identical.
    const basePath = headersList.get('x-client-base-path') || `/c/${coach_slug}`

    if (!coachId) {
        redirect('/not-found')
    }

    // Los gates del nav (movimiento / composicion / dominio Nutricion) NO se esperan aca: viven
    // en <ClientNavGates> bajo <Suspense> mas abajo. Mientras el await estaba en este cuerpo,
    // `children` no podia siquiera empezar a renderizar — ni su loading.tsx salia — porque el
    // arbol entero espera a que el layout retorne. Nada del resto del layout los consume.

    return (
        <>
            <link rel="icon" href={faviconUrl} />
            {/* apple-touch-icon: logo raster del coach (o EVA). El favicon SVG generado NO sirve
                acá — iOS lo ignora. Ver appleTouchIconFor. */}
            <link rel="apple-touch-icon" href={appleTouchIconFor(logoUrl)} />
            {/* Raw manifest link (NOT metadata.manifest) so it carries crossOrigin —
                the browser must send cookies when fetching /api/manifest/[slug], else
                getUser() is null and the team (/t) start_url/scope/branding collapse to /c. */}
            <link rel="manifest" href={`/api/manifest/${coach_slug}`} crossOrigin="use-credentials" />
            {APPLE_SPLASH.map(({ dw, dh, r }) => (
                <link
                    key={`${dw}x${dh}@${r}`}
                    rel="apple-touch-startup-image"
                    media={`screen and (device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
                    href={`/api/splash/${coach_slug}?w=${dw * r}&h=${dh * r}`}
                />
            ))}
            <style dangerouslySetInnerHTML={{ __html: `
                :root {
                    --theme-primary: ${lightAccent};
                    --theme-primary-rgb: ${palette.primaryRgb};
                    --theme-primary-dark: ${palette.primaryDark};
                    --theme-primary-light: ${palette.primaryLight};
                    --theme-primary-surface: ${palette.primarySurface};
                    --theme-primary-glow: ${palette.primaryGlow};
                    --theme-primary-foreground: ${lightOnAccent};
                    --primary: ${lightAccent};
                    --primary-foreground: ${lightOnAccent};
                    --theme-secondary: ${lightAccent2};
                    --theme-secondary-rgb: ${palette.secondaryRgb ?? palette.primaryRgb};
                    --theme-secondary-foreground: ${lightOnAccent2};
                    --seal-p-rgb: ${sealVars.light.primaryRgb};
                    --seal-s-rgb: ${sealVars.light.secondaryRgb};
                    --sport-100: ${sportTokens.ramp['100']};
                    --sport-200: ${sportTokens.ramp['200']};
                    --sport-300: ${sportTokens.ramp['300']};
                    --sport-400: ${sportTokens.ramp['400']};
                    --sport-500: ${sportTokens.ramp['500']};
                    --sport-600: ${sportTokens.ramp['600']};
                    --sport-700: ${sportTokens.ramp['700']};
                    --cta-fill: ${sportTokens.ctaFill};
                    --focus-ring: ${sportTokens.focusRing};
                    --text-on-sport: ${sportTokens.textOnSport};
                    --brand-font: ${brandFontStack};
                    --coach-loader-variant: '${loaderVariant}';
                    --coach-loader-text: '${safeLoaderText}';
                    --coach-use-custom-loader: ${useCustomLoader ? '1' : '0'};
                    --coach-loader-color: '${safeLoaderTextColor}';
                    --coach-loader-icon-mode: '${loaderIconMode}';
                    --coach-loader-config: '${safeLoaderConfig}';
                }
                /* Dark-mode accent (next-themes .dark class) — org can set a brighter accent for dark. */
                .dark {
                    --theme-primary: ${darkAccent};
                    --theme-primary-foreground: ${darkOnAccent};
                    --primary: ${darkAccent};
                    --primary-foreground: ${darkOnAccent};
                    --theme-secondary: ${darkAccent2};
                    --theme-secondary-foreground: ${darkOnAccent2};
                    --seal-p-rgb: ${sealVars.dark.primaryRgb};
                    --seal-s-rgb: ${sealVars.dark.secondaryRgb};
                    --sport-100: ${sportTokens.dark['100']};
                    --sport-600: ${sportTokens.dark['600']};
                    --sport-700: ${sportTokens.dark['700']};
                    --cta-fill: ${sportTokens.ctaFill};
                }
            ` }} />
            {/* QA2 D1 — `min-h-dvh` (100dvh incluye la safe-area inferior con viewport-fit=cover) +
                `bg-background`: el shell del alumno cubre SIEMPRE el viewport completo, así el
                lienzo del documento nunca asoma bajo la app. `has-[.is-workout-page]` cierra el
                caso del ejecutor, que es DARK-ONLY por contrato: sin esto, un alumno en tema CLARO
                veía `bg-background` (--paper, casi blanco) en cualquier franja que el overlay
                `fixed` del ejecutor no alcanzara a cubrir en iOS Safari. Ver el bloque "Lienzo del
                documento" en globals.css para la causa raíz completa. */}
            <div
                className="flex flex-col md:flex-row min-h-dvh antialiased bg-background text-foreground has-[.is-workout-page]:bg-[var(--exec-canvas)]"
                style={{ '--theme-primary-rgb': palette.primaryRgb } as React.CSSProperties}
                data-coach-slug={coach_slug}
                data-brand-name={brandName}
                data-primary-color={primaryColor}
                data-logo-url={logoUrl}
                data-logo-dark={logoUrlDark || undefined}
                data-loader-variant={loaderVariant}
                data-executor-theme={executorTheme}
            >
                <NetworkProvider brandName={brandName} logoUrl={logoUrl} logoUrlDark={logoUrlDark || undefined} primaryColor={primaryColor}>
                  <BasePathProvider value={basePath}>
                   {/* Morph de lanzamiento del workout (QA8): el provider vive en ESTE layout — persiste
                       entre dashboard y ejecutor, así el overlay sobrevive al swap del App Router y la
                       coreografía corre completa como loader único del workout. */}
                   <WorkoutLaunchProvider>
                    <OfflineNutritionQueueSync />
                    <OfflineWorkoutQueueSync />
                    {/* Identidad de Sentry del alumno. Aislada bajo <Suspense> por la MISMA razón
                        que los gates del nav: ningún await de este cuerpo debe frenar a `children`.
                        No pinta nada (el componente cliente devuelve null). */}
                    <Suspense fallback={null}>
                        <StudentSentryIdentity />
                    </Suspense>
                    {/* QW1 TTFB: los 3 gates del nav son lecturas a DB (3 hops c/u antes del
                        dedupe). Aislados aca, el shell + la page streamean primero y el nav entra
                        cuando resuelven. El fallback solo reserva el ancho del sidebar desktop —
                        no muestra ningun tab: qué se ve lo decide SIEMPRE el componente real. */}
                    <Suspense fallback={<ClientNavFallback />}>
                        <ClientNavGates
                            coachSlug={coach_slug}
                            basePath={basePath}
                            coachBrand={brandName}
                            coachLogoUrl={logoUrl}
                            coachLogoDarkUrl={logoUrlDark || undefined}
                            demoMode={demoMode}
                        />
                    </Suspense>
                    {/* InstallPrompt se renderiza una sola vez global (root app/layout.tsx) y se
                        auto-brandea leyendo los data-* de este wrapper cuando está bajo /c.
                        AppDownloadBanner se removió (decisión CEO: promos de app store fuera; los
                        enlaces apuntaban a listados de tienda inexistentes). */}

                    {/* `has-[.is-workout-page]:bg-[var(--exec-canvas)]` acompaña al wrapper (QA2 D1):
                        el `bg-muted/20` del tema claro era la capa que se veía blanca bajo la
                        pantalla final del ejecutor. */}
                    <main className="relative z-0 flex-1 overflow-auto bg-muted/20 pb-[var(--mobile-content-bottom-offset)] dark:bg-background md:pb-0 has-[.is-workout-page]:bg-[var(--exec-canvas)] has-[.is-workout-page]:pb-0">
                        {/* Sello EVA v2 «Horizonte B» (SPEC eva-seal-background D1): fondo por
                            defecto del shell logueado del alumno/PWA, detrás del contenido (el
                            main ya es `relative z-0` = stacking context, así el `-z-10` del sello
                            pinta sobre el fondo del main y bajo las cards). Este árbol tiene UN
                            solo layout: el login del alumno (/c/‹slug›/login) se apaga
                            estructuralmente en globals.css (`main:has(.login-brand)` — D2
                            pre-auth intacto, sin pathname). */}
                        <AppSeal />
                        {/* Vista de ejemplo: estado visible + salida de un toque. Bajo <Suspense>
                            por la misma razón que los gates del nav — resuelve el vocabulario de la
                            persona del coach y ningún await suyo debe frenar a `children`. Se oculta
                            solo en el ejecutor de rutina (regla `main:has(.is-workout-page)` de
                            globals.css): esa pantalla es de pantalla completa. */}
                        <Suspense fallback={null}>
                            <DemoViewerBanner identifier={coach_slug} />
                        </Suspense>
                        {isStudentGrace && (
                            <div className="mx-auto mt-3 max-w-2xl px-4 pt-safe">
                                {/* info-* = rampa DS fija (nunca white-label): banner discreto, tono
                                    informativo — el alumno sigue 100% funcional durante la gracia. */}
                                <div className="rounded-xl border border-[var(--info-500)]/30 bg-[var(--info-100)] px-4 py-3 text-sm text-[var(--info-600)]" role="status">
                                    {STUDENT_ACCESS_COPY.graceBanner}
                                </div>
                            </div>
                        )}
                        {isStudentReadonly && (
                            <div className="mx-auto mt-3 max-w-2xl px-4 pt-safe">
                                {/* warning-* = rampa DS fija (nunca white-label): banner honesto del modo
                                    solo-lectura post-gracia (espejo del StudentAccessBanner 'blocked' RN). */}
                                <div className="rounded-xl border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-4 py-3 text-sm text-[var(--warning-700)]" role="status">
                                    <strong className="font-bold">{STUDENT_ACCESS_COPY.pausedTitle}.</strong>{' '}
                                    {STUDENT_ACCESS_COPY.pausedWriteError}
                                </div>
                            </div>
                        )}
                        {isOrphan && (
                            <div className="mx-auto mt-3 max-w-2xl px-4 pt-safe">
                                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                                    Tu coach ya no está disponible en {orphanOrgName || 'tu organización'}.
                                    Habla con {orphanOrgName || 'tu organización'} para que te asignen un nuevo coach.
                                </div>
                            </div>
                        )}
                        {children}
                        {/* Pricing v3 (D3=A): el viejo «Potenciado por EVA» (opacidad 50, solo Free
                            sin marca) muere; ahora el sello «Hecho con EVA» lo llevan Free/Starter
                            CON su marca puesta. Va acá, sobre el fondo de página (superficie
                            neutra) y arriba del enlace de privacidad — nunca sobre el color del
                            coach, así el contraste no depende de su hex. La bottom-nav flotante ya
                            está compensada por el padding inferior de <main>. */}
                        {showsEvaBadge(subscriptionTier) && <EvaBadge medium="student_app" />}
                        <div className="py-1.5 text-center">
                            <a
                                href="mailto:privacidad@eva-app.cl"
                                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
                            >
                                Privacidad · ARCO
                            </a>
                        </div>
                    </main>
                   </WorkoutLaunchProvider>
                  </BasePathProvider>
                </NetworkProvider>
            </div>
        </>
    )
}

/**
 * Puente de identidad alumno → Sentry. `getClientRootUser` es `cache()` sobre `auth.getClaims()`
 * (verificación LOCAL del JWT, sin round-trip a GoTrue) y el resto del árbol `/c` ya lo llama en el
 * mismo request, así que esto NO agrega una consulta. Sin sesión (p. ej. `/c/‹slug›/login`) devuelve
 * null y no se identifica a nadie.
 */
async function StudentSentryIdentity() {
    const user = await getClientRootUser()
    if (!user) return null
    return <IdentifyStudentOnMount userId={user.id} />
}

function generateFaviconSvg(brandName: string, color: string): string {
    const initial = brandName.charAt(0).toUpperCase()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-weight="bold" font-size="36">${initial}</text></svg>`
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
