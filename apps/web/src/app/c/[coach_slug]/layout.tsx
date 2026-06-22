import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import {
    BRAND_APP_ICON,
    SYSTEM_PRIMARY_COLOR,
    BRAND_OG_IMAGE,
    BRAND_OG_IMAGE_HEIGHT,
    BRAND_OG_IMAGE_WIDTH,
    BRAND_PRIMARY_COLOR,
} from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
import { ClientNav } from '@/components/client/ClientNav'
import { getStudentMovementNavEnabled, getStudentBodyCompositionNavEnabled, getStudentNutritionNavEnabled } from './_data/client-root.queries'
import { BasePathProvider } from '@/components/client/BasePathProvider'
import { AppDownloadBanner } from '@/components/AppDownloadBanner'
import { NetworkProvider } from '@/components/client/OfflineScreen'
import { OfflineNutritionQueueSync } from '@/app/c/[coach_slug]/_components/OfflineNutritionQueueSync'
import { OfflineWorkoutQueueSync } from '@/app/c/[coach_slug]/_components/OfflineWorkoutQueueSync'
import { generateBrandPalette } from '@/lib/color-utils'
import { resolveBrandTheme } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { resolveLoaderVariant } from '@/lib/brand-loaders'

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    // Read branding from middleware headers — no extra DB query needed
    const headersList = await headers()
    const brandName = headersList.get('x-coach-brand-name') ?? 'Mi Coach'
    const logoUrl = headersList.get('x-coach-logo-url') || null

    const metadataBase = resolveMetadataBase()
    const openGraphImageAbsoluteUrl = new URL(BRAND_OG_IMAGE, metadataBase).href
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
                apple: [{ url: logoUrl }],
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
                    width: BRAND_OG_IMAGE_WIDTH,
                    height: BRAND_OG_IMAGE_HEIGHT,
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

    // Read branding from middleware headers (set in middleware.ts)
    // Free coaches: enforce EVA branding — white-label is a paid feature
    const subscriptionTier = (headersList.get('x-coach-subscription-tier') ?? 'starter') as SubscriptionTier
    // white-label v2: branding = Pro+ ENTERO (no solo 'free'). `isFreeTier` ahora significa "< Pro".
    // El proxy ya manda defaults EVA para < Pro; esto es defense-in-depth (fila stale post-downgrade).
    const isFreeTier = !isBrandingAllowed(subscriptionTier)
    const primaryColor = isFreeTier
        ? SYSTEM_PRIMARY_COLOR
        : (headersList.get('x-coach-primary-color') ?? BRAND_PRIMARY_COLOR)
    const logoUrl = isFreeTier
        ? BRAND_APP_ICON
        : (headersList.get('x-coach-logo-url') || BRAND_APP_ICON)
    const brandName = headersList.get('x-coach-brand-name') ?? 'Mi Coach'
    // B-9: enterprise client whose coach left the org — show a reassignment prompt.
    const isOrphan = headersList.get('x-workspace-orphan') === 'true'
    const orphanOrgName = headersList.get('x-orphan-org-name') ?? ''
    const coachId = headersList.get('x-coach-id') ?? ''
    const useBrandColorsStr = headersList.get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true
    const loaderText = headersList.get('x-coach-loader-text') ?? ''
    const useCustomLoader = headersList.get('x-coach-use-custom-loader') === 'true'
    const loaderTextColor = headersList.get('x-coach-loader-text-color') ?? undefined
    const loaderIconModeRaw = headersList.get('x-coach-loader-icon-mode') ?? 'eva'
    const loaderIconMode = (loaderIconModeRaw === 'coach' || loaderIconModeRaw === 'none') ? loaderIconModeRaw : 'eva'
    // white-label v2 — fuente curada + variante de loader + logo dark (todos gateados a Pro+ por isFreeTier).
    const fontKey = isFreeTier ? '' : (headersList.get('x-coach-font-key') ?? '')
    const brandFontStack = resolveBrandFontStack(fontKey) // server-side; nunca el string crudo del coach
    const loaderVariant = isFreeTier ? 'eva' : resolveLoaderVariant(headersList.get('x-coach-loader-variant'))
    const logoUrlDark = isFreeTier ? '' : (headersList.get('x-coach-logo-url-dark') || '')

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

    // Per-mode white-label accent (org-driven). brand-kit resolves a readable
    // light + dark accent from the brand color + optional per-mode overrides.
    const accentLight = isFreeTier ? null : (headersList.get('x-coach-accent-light') || null)
    const accentDark = isFreeTier ? null : (headersList.get('x-coach-accent-dark') || null)
    const neutralTint = !isFreeTier && headersList.get('x-coach-neutral-tint') === 'true'
    // color2 INDEPENDIENTE (white-label v2): un color → clampeado por-modo a accent2 (legible en ambos).
    const secondaryColor = isFreeTier ? null : (headersList.get('x-coach-secondary-color') || null)
    const brandTheme = resolveBrandTheme({ brandColor: primaryColor, accentLight, accentDark, neutralTint, secondaryLight: secondaryColor, secondaryDark: secondaryColor })

    // Generate full brand palette (derived shades) from the resolved light accent + secondary.
    const palette = generateBrandPalette(brandTheme.light.accent, brandTheme.light.accent2)
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

    // Espejo de los modulos movement_assessment + body_composition con el contexto del PROPIO
    // alumno (pool => su team; standalone => su coach) — mismo gate que la page.
    const [showMovement, showBodyComposition, showNutrition] = await Promise.all([
        getStudentMovementNavEnabled(),
        getStudentBodyCompositionNavEnabled(),
        // Master switch del dominio Nutricion (plan §4.8): si el coach lo apago para este alumno,
        // el tab "Plan Alimenticio" del nav NO se monta (render-only; la page tambien gatea).
        getStudentNutritionNavEnabled(),
    ])

    return (
        <>
            <link rel="icon" href={faviconUrl} />
            <link rel="apple-touch-icon" href={faviconUrl} />
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
                    --brand-font: ${brandFontStack};
                    --coach-loader-variant: '${loaderVariant}';
                    --coach-loader-text: '${safeLoaderText}';
                    --coach-use-custom-loader: ${useCustomLoader ? '1' : '0'};
                    --coach-loader-color: '${safeLoaderTextColor}';
                    --coach-loader-icon-mode: '${loaderIconMode}';
                }
                /* Dark-mode accent (next-themes .dark class) — org can set a brighter accent for dark. */
                .dark {
                    --theme-primary: ${darkAccent};
                    --theme-primary-foreground: ${darkOnAccent};
                    --primary: ${darkAccent};
                    --primary-foreground: ${darkOnAccent};
                    --theme-secondary: ${darkAccent2};
                    --theme-secondary-foreground: ${darkOnAccent2};
                }
            ` }} />
            <div
                className="flex flex-col md:flex-row min-h-dvh antialiased bg-background text-foreground"
                style={{ '--theme-primary-rgb': palette.primaryRgb } as React.CSSProperties}
                data-coach-slug={coach_slug}
                data-brand-name={brandName}
                data-logo-dark={logoUrlDark || undefined}
                data-loader-variant={loaderVariant}
            >
                <NetworkProvider brandName={brandName} logoUrl={logoUrl} primaryColor={primaryColor}>
                  <BasePathProvider value={basePath}>
                    <OfflineNutritionQueueSync />
                    <OfflineWorkoutQueueSync />
                    <ClientNav
                        coachSlug={coach_slug}
                        basePath={basePath}
                        coachBrand={brandName}
                        coachLogoUrl={logoUrl}
                        initialUseBrandColors={initialUseBrandColors}
                        showMovement={showMovement}
                        showBodyComposition={showBodyComposition}
                        showNutrition={showNutrition}
                    />
                    {/* InstallPrompt is rendered once globally in the root app/layout.tsx —
                        rendering a second one here stacked two banners for the student tree. */}
                    <AppDownloadBanner brandName={brandName} primaryColor={primaryColor} />

                    <main className="relative z-0 flex-1 overflow-auto bg-muted/20 pb-[var(--mobile-content-bottom-offset)] dark:bg-background md:pb-0 has-[.is-workout-page]:pb-0">
                        {isOrphan && (
                            <div className="mx-auto mt-3 max-w-2xl px-4 pt-safe">
                                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                                    Tu coach ya no está disponible en {orphanOrgName || 'tu organización'}.
                                    Hablá con {orphanOrgName || 'tu organización'} para que te asignen un nuevo coach.
                                </div>
                            </div>
                        )}
                        {children}
                        {isFreeTier && (
                            <a
                                href="https://www.eva-app.cl?utm_source=free_footer&utm_medium=client_app&utm_campaign=powered_by"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full py-2 text-center text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            >
                                Potenciado por EVA
                            </a>
                        )}
                        <div className="py-1.5 text-center">
                            <a
                                href="mailto:privacidad@eva-app.cl"
                                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
                            >
                                Privacidad · ARCO
                            </a>
                        </div>
                    </main>
                  </BasePathProvider>
                </NetworkProvider>
            </div>
        </>
    )
}

function generateFaviconSvg(brandName: string, color: string): string {
    const initial = brandName.charAt(0).toUpperCase()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-weight="bold" font-size="36">${initial}</text></svg>`
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
