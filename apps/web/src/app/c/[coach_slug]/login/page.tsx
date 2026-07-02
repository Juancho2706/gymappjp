import { notFound } from 'next/navigation'
import Image from 'next/image'
import ClientLoginForm from './ClientLoginForm'
import type { Metadata } from 'next'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_APP_ICON, BRAND_APP_ICON_512 } from '@/lib/brand-assets'
import { LoginEntrance, LoginEntranceItem } from './_components/LoginEntrance'
import { getClientLoginCoach, getClientLoginMetadataCoach } from './_data/login.queries'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { resolveBrandTheme, resolvePresetBranding } from '@eva/brand-kit'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { generateBrandPalette } from '@/lib/color-utils'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
import { resolveLoginLayout, parseLoaderConfig, type LoginLayoutKey } from '@/lib/brand-composer'
import { CompositeLoaderView, LoaderVariantView } from '@/components/loaders/variants'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    const coach = await getClientLoginMetadataCoach(coach_slug)
    const brandName = coach?.brand_name ?? 'Mi Coach'

    return {
        title: `Ingresar | ${brandName}`,
        manifest: `/api/manifest/${coach_slug}`,
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: coach?.logo_url
            ? {
                icon: [{ url: coach.logo_url }],
                shortcut: [{ url: coach.logo_url }],
                apple: [{ url: coach.logo_url }],
            }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
    }
}

/** Initials del nombre de marca para el brand-mark cuando no hay logo (estilo diseño). */
function brandInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'EVA'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default async function ClientLoginPage({ params }: Props) {
    const { coach_slug } = await params
    const coach = await getClientLoginCoach(coach_slug)

    if (!coach) notFound()

    // white-label v2: branding pre-auth = Pro+ ENTERO. free/starter → EVA visual, conservando el nombre.
    // white-label W1a — tema preset curado: si el coach eligió un preset, sus valores overridean
    // color/color2/accent/tinte/fuente/loader ANTES de resolver el tema. NULL/desconocida → passthrough.
    const presetBrand = resolvePresetBranding(coach)
    const brandingAllowed = isBrandingAllowed((coach.subscription_tier ?? 'free') as SubscriptionTier)
    const brandColor = brandingAllowed ? (presetBrand.primary_color || BRAND_PRIMARY_COLOR) : BRAND_PRIMARY_COLOR
    const theme = resolveBrandTheme({
        brandColor,
        accentLight: brandingAllowed ? (presetBrand.accent_light || null) : null,
        accentDark: brandingAllowed ? (presetBrand.accent_dark || null) : null,
        secondaryLight: brandingAllowed ? (presetBrand.brand_secondary_color || null) : null,
        secondaryDark: brandingAllowed ? (presetBrand.brand_secondary_color || null) : null,
        neutralTint: brandingAllowed ? (presetBrand.neutral_tint ?? false) : false,
    })
    const accentRgb = generateBrandPalette(theme.light.accent).primaryRgb.replace(/,\s*/g, ' ')
    const logoUrl = brandingAllowed ? coach.logo_url : null
    // Fuente solo en el wordmark/título (decisión #4); inputs/cuerpo en Inter (primera pantalla, sin cache).
    const brandFontStack = resolveBrandFontStack(brandingAllowed ? (presetBrand.brand_font_key ?? '') : '')

    // white-label W1b — layout de login (4 variantes) + loader del coach (para la variante "energia").
    const layout: LoginLayoutKey = brandingAllowed ? resolveLoginLayout(coach.login_layout_key) : 'clasico'
    const loaderConfig = brandingAllowed ? parseLoaderConfig(coach.loader_config) : null
    const loaderVariant = brandingAllowed ? resolveLoaderVariant(presetBrand.loader_variant) : 'eva'

    const initials = brandInitials(coach.brand_name)
    const tagline = coach.welcome_message?.trim() || 'Tu plataforma de entrenamiento personalizado'
    const accentVars = { '--theme-primary': theme.light.accent, '--theme-primary-rgb': accentRgb } as React.CSSProperties

    // Brand-mark reutilizable (logo del coach o iniciales) — escalable por px. glass = sobre el hero oscuro.
    const brandMark = (px: number, glass: boolean) =>
        logoUrl ? (
            <div
                className="relative flex items-center justify-center overflow-hidden rounded-2xl"
                style={{
                    width: px, height: px,
                    background: glass ? 'rgba(255,255,255,0.16)' : 'var(--surface-sunken)',
                    border: glass ? '1px solid rgba(255,255,255,0.28)' : '1px solid var(--border-subtle)',
                    backdropFilter: glass ? 'blur(6px)' : undefined,
                    WebkitBackdropFilter: glass ? 'blur(6px)' : undefined,
                }}
            >
                <Image src={logoUrl} alt={coach.brand_name} fill className="object-contain" style={{ padding: px * 0.16 }} />
            </div>
        ) : (
            <div
                className="flex items-center justify-center rounded-2xl font-display font-black"
                style={{
                    width: px, height: px, fontSize: px * 0.36,
                    color: glass ? '#fff' : 'var(--login-accent)',
                    background: glass ? 'rgba(255,255,255,0.16)' : 'color-mix(in srgb, var(--login-accent) 12%, transparent)',
                    border: glass ? '1px solid rgba(255,255,255,0.28)' : '1px solid color-mix(in srgb, var(--login-accent) 25%, transparent)',
                    backdropFilter: glass ? 'blur(6px)' : undefined,
                    WebkitBackdropFilter: glass ? 'blur(6px)' : undefined,
                }}
            >
                {initials}
            </div>
        )

    // Loader del coach (para "energia") — composite > variante > EVA. Lee --theme-primary del wrapper.
    const coachLoaderNode = loaderConfig ? (
        <CompositeLoaderView
            config={loaderConfig}
            brandName={coach.brand_name}
            iconSrc={loaderConfig.symbol === 'logo' ? (logoUrl || BRAND_APP_ICON) : BRAND_APP_ICON}
            size="lg"
        />
    ) : loaderVariant !== 'eva' ? (
        <LoaderVariantView
            variant={loaderVariant}
            brandName={coach.brand_name}
            iconSrc={logoUrl || BRAND_APP_ICON}
            size="lg"
        />
    ) : (
        <EvaRouteLoader
            size="lg"
            useCustom
            customText={coach.brand_name}
            iconMode={logoUrl ? 'coach' : 'eva'}
            coachLogoUrl={logoUrl || undefined}
            primaryColor={theme.light.accent}
        />
    )

    const poweredBy = (
        <div className="flex items-center justify-center gap-1.5 pt-[18px] text-[11px] text-text-subtle">
            con tecnología de
            <span className="inline-flex items-center gap-1 opacity-70">
                <Image src={BRAND_APP_ICON_512} alt="EVA" width={14} height={14} className="rounded-[3px]" />
                <span className="font-semibold text-text-muted">EVA</span>
            </span>
        </div>
    )

    const loginForm = (
        <ClientLoginForm
            coachSlug={coach_slug}
            primaryColor={theme.light.accent}
            brandName={coach.brand_name}
            logoUrl={logoUrl}
        />
    )

    return (
        <div className="login-brand relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-surface-app">
            {/* Acento por-modo + fuente: scoped a .login-brand para no tocar el resto del árbol. */}
            <style dangerouslySetInnerHTML={{ __html: `.login-brand{--login-accent:${theme.light.accent};--login-accent-rgb:${accentRgb};--login-font:${brandFontStack};}.dark .login-brand{--login-accent:${theme.dark.accent};}` }} />

            {/* ── LAYOUT: minimal — tipografía pura sobre fondo sólido ── */}
            {layout === 'minimal' ? (
                <LoginEntrance className="flex flex-1 flex-col justify-center px-7 pb-8 pt-[max(3.5rem,env(safe-area-inset-top))]">
                    <LoginEntranceItem className="mb-8">
                        {logoUrl && <div className="mb-6">{brandMark(56, false)}</div>}
                        <h1
                            className="font-display text-[34px] font-black leading-[1.05] tracking-[-0.03em] text-text-strong"
                            style={{ fontFamily: 'var(--login-font)' }}
                        >
                            {coach.brand_name}
                        </h1>
                        <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-text-muted">{tagline}</p>
                    </LoginEntranceItem>
                    <LoginEntranceItem>
                        {loginForm}
                        {poweredBy}
                    </LoginEntranceItem>
                </LoginEntrance>
            ) : layout === 'hero' ? (
                /* ── LAYOUT: hero grande — logo protagonista centrado con fundido ── */
                <LoginEntrance className="flex flex-1 flex-col">
                    <div className="relative flex flex-1 flex-col items-center justify-center px-7 pb-10 pt-[max(4rem,env(safe-area-inset-top))] text-center">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0"
                            style={{ background: 'radial-gradient(90% 55% at 50% 30%, color-mix(in oklab, var(--login-accent) 22%, transparent), transparent 70%)' }}
                        />
                        <LoginEntranceItem className="relative">{brandMark(116, false)}</LoginEntranceItem>
                        <LoginEntranceItem className="relative mt-5">
                            <h1
                                className="font-display text-[30px] font-black tracking-[-0.02em] text-text-strong"
                                style={{ fontFamily: 'var(--login-font)' }}
                            >
                                {coach.brand_name}
                            </h1>
                            <p className="mx-auto mt-2 max-w-[290px] text-sm leading-relaxed text-text-muted">{tagline}</p>
                        </LoginEntranceItem>
                    </div>
                    <LoginEntranceItem className="rounded-t-[var(--radius-2xl)] border-t border-subtle bg-surface-card px-6 pb-7 pt-6 shadow-[var(--shadow-lg)]">
                        {loginForm}
                        {poweredBy}
                    </LoginEntranceItem>
                </LoginEntrance>
            ) : layout === 'energia' ? (
                /* ── LAYOUT: energía — entrada animada con el loader del coach ── */
                <LoginEntrance className="flex flex-1 flex-col">
                    <div
                        className="relative flex flex-1 flex-col items-center justify-center px-7 pb-10 pt-[max(3.5rem,env(safe-area-inset-top))] text-center"
                        style={accentVars}
                    >
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0"
                            style={{ background: 'radial-gradient(85% 50% at 50% 35%, color-mix(in oklab, var(--login-accent) 16%, transparent), transparent 72%)' }}
                        />
                        <LoginEntranceItem className="relative">{coachLoaderNode}</LoginEntranceItem>
                        <LoginEntranceItem className="relative mt-5">
                            <p className="mx-auto max-w-[290px] text-sm leading-relaxed text-text-muted">{tagline}</p>
                        </LoginEntranceItem>
                    </div>
                    <LoginEntranceItem className="rounded-t-[var(--radius-2xl)] border-t border-subtle bg-surface-card px-6 pb-7 pt-6 shadow-[var(--shadow-lg)]">
                        <p className="mb-[18px] text-center text-[13px] text-text-muted">
                            Iniciá sesión para entrenar con <b className="text-text-strong">{coach.brand_name}</b>
                        </p>
                        {loginForm}
                        {poweredBy}
                    </LoginEntranceItem>
                </LoginEntrance>
            ) : (
                /* ── LAYOUT: clasico (default) — hero full-bleed con el color del coach ── */
                <LoginEntrance className="flex flex-1 flex-col">
                    <LoginEntranceItem className="relative flex-shrink-0 overflow-hidden px-7 pb-16 pt-[92px] text-center">
                        <div
                            aria-hidden
                            className="absolute inset-0"
                            style={{
                                background:
                                    'radial-gradient(120% 90% at 50% 12%, var(--login-accent) 0%, color-mix(in oklab, var(--login-accent) 80%, black) 58%, color-mix(in oklab, var(--login-accent) 60%, black) 100%)',
                            }}
                        />
                        {/* Brillo ambiente sutil sobre el hero */}
                        <div
                            aria-hidden
                            className="absolute inset-0 opacity-50"
                            style={{ background: 'radial-gradient(80% 60% at 20% 0%, rgba(255,255,255,0.18), transparent 60%)' }}
                        />
                        <div className="relative">
                            <div className="inline-flex">{brandMark(76, true)}</div>
                            <h1
                                className="mt-4 font-display text-[27px] font-black tracking-[-0.02em] text-white"
                                style={{ fontFamily: 'var(--login-font)' }}
                            >
                                {coach.brand_name}
                            </h1>
                            <p className="mx-auto mt-1.5 max-w-[280px] text-sm leading-relaxed text-white/80">
                                {tagline}
                            </p>
                        </div>
                    </LoginEntranceItem>

                    <LoginEntranceItem className="relative z-[2] -mt-[26px] flex-1 rounded-t-[var(--radius-2xl)] bg-surface-app px-6 pb-7 pt-[26px]">
                        <p className="mb-[18px] text-center text-[13px] text-text-muted">
                            Iniciá sesión para entrenar con <b className="text-text-strong">{coach.brand_name}</b>
                        </p>
                        {loginForm}
                        {poweredBy}
                    </LoginEntranceItem>
                </LoginEntrance>
            )}

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
