import { notFound } from 'next/navigation'
import ClientLoginForm from './ClientLoginForm'
import type { Metadata } from 'next'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { LoginEntrance, LoginEntranceItem } from './_components/LoginEntrance'
import { getClientLoginCoach, getClientLoginMetadataCoach } from './_data/login.queries'
import { isBrandingAllowed, showsEvaBadge, type SubscriptionTier } from '@eva/tiers'
import { EvaBadge } from '@/components/brand/EvaBadge'
import { resolveBrandTheme, resolvePresetBranding, consolidateStandaloneBranding } from '@eva/brand-kit'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { generateBrandPalette } from '@/lib/color-utils'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
import { resolveLoginLayout, parseLoaderConfig, type LoginLayoutKey } from '@/lib/brand-composer'
import { CompositeLoaderView, LoaderVariantView } from '@/components/loaders/variants'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import { ThemedLogo } from '@/components/brand/ThemedLogo'

interface Props {
    params: Promise<{ coach_slug: string }>
    /**
     * «Vive tu app» directo §4: `/vive-tu-app` manda `?error=vive_tu_app_expirado` cuando el magic
     * link del demo venció o ya se usó. Hasta hoy la page no leía `searchParams` y el coach caía en
     * un login pelado. Se pasa a las DOS instancias del form (móvil y desktop coexisten en el DOM).
     */
    searchParams: Promise<{ error?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    const coach = await getClientLoginMetadataCoach(coach_slug)
    const brandName = coach?.brand_name ?? 'Mi Coach'

    return {
        title: 'Ingresar',
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

export default async function ClientLoginPage({ params, searchParams }: Props) {
    const { coach_slug } = await params
    const coach = await getClientLoginCoach(coach_slug)

    if (!coach) notFound()

    const errorCode = (await searchParams).error ?? null

    // Pricing v3 (owner 2026-08-21): el branding pre-auth es de TODOS los planes. `brandingAllowed`
    // queda como red de seguridad FAIL-CLOSED (solo un tier inválido/stale cae a skin EVA); lo que
    // separa a Free de Pro es el sello «Hecho con EVA» bajo el formulario.
    // white-label W1a — tema preset curado: si el coach eligió un preset, sus valores overridean
    // color/color2/accent/tinte/fuente/loader ANTES de resolver el tema. NULL/desconocida → passthrough.
    const presetBrand = resolvePresetBranding(coach)
    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    const brandingAllowed = isBrandingAllowed(tier)
    const brandColor = brandingAllowed ? (presetBrand.primary_color || BRAND_PRIMARY_COLOR) : BRAND_PRIMARY_COLOR
    // W-brand B2: login del alumno = superficie standalone — sin preset (legacy custom) el
    // secundario resuelto se deriva del primario (sealPair) y los accent_*/secundario
    // ALMACENADOS dejan de leerse. Con preset, passthrough (par curado del catálogo).
    const consolidatedBrand = brandingAllowed
        ? consolidateStandaloneBranding(presetBrand, brandColor)
        : presetBrand
    const theme = resolveBrandTheme({
        brandColor,
        accentLight: brandingAllowed ? (consolidatedBrand.accent_light || null) : null,
        accentDark: brandingAllowed ? (consolidatedBrand.accent_dark || null) : null,
        secondaryLight: brandingAllowed ? (consolidatedBrand.brand_secondary_color || null) : null,
        secondaryDark: brandingAllowed ? (consolidatedBrand.brand_secondary_color || null) : null,
        neutralTint: brandingAllowed ? (consolidatedBrand.neutral_tint ?? false) : false,
    })
    const accentRgb = generateBrandPalette(theme.light.accent).primaryRgb.replace(/,\s*/g, ' ')
    const logoUrl = brandingAllowed ? coach.logo_url : null
    const logoUrlDark = brandingAllowed ? coach.logo_url_dark : null
    // Fuente solo en el wordmark/título (decisión #4); inputs/cuerpo en Inter (primera pantalla, sin cache).
    const brandFontStack = resolveBrandFontStack(brandingAllowed ? (presetBrand.brand_font_key ?? '') : '')

    // white-label W1b — layout de login (4 variantes) + loader del coach (para la variante "energia").
    const layout: LoginLayoutKey = brandingAllowed ? resolveLoginLayout(coach.login_layout_key) : 'clasico'
    const loaderConfig = brandingAllowed ? parseLoaderConfig(coach.loader_config) : null
    const loaderVariant = brandingAllowed ? resolveLoaderVariant(presetBrand.loader_variant) : 'eva'

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
                <ThemedLogo light={logoUrl} dark={logoUrlDark} alt={coach.brand_name} fill className="object-contain" style={{ padding: px * 0.16 }} />
            </div>
        ) : (
            <div
                className="relative flex items-center justify-center overflow-hidden rounded-2xl"
                style={{
                    width: px, height: px, fontSize: px * 0.36,
                    background: glass ? 'rgba(255,255,255,0.16)' : 'var(--surface-sunken)',
                    border: glass ? '1px solid rgba(255,255,255,0.28)' : '1px solid color-mix(in srgb, var(--login-accent) 25%, transparent)',
                    backdropFilter: glass ? 'blur(6px)' : undefined,
                    WebkitBackdropFilter: glass ? 'blur(6px)' : undefined,
                }}
            >
                <ThemedLogo
                    light={BRAND_APP_ICON}
                    dark={BRAND_APP_ICON}
                    alt="EVA"
                    fill
                    className="eva-system-mark object-contain"
                    style={{ padding: px * 0.2 }}
                />
            </div>
        )

    // Loader del coach (para "energia") — composite > variante > EVA. Lee --theme-primary del wrapper.
    const coachLoaderNode = loaderConfig ? (
        <CompositeLoaderView
            config={loaderConfig}
            brandName={coach.brand_name}
            iconSrc={loaderConfig.symbol === 'logo' ? (logoUrl || BRAND_APP_ICON) : BRAND_APP_ICON}
            iconSrcDark={loaderConfig.symbol === 'logo' && logoUrl ? (logoUrlDark || logoUrl) : undefined}
            size="lg"
        />
    ) : loaderVariant !== 'eva' ? (
        <LoaderVariantView
            variant={loaderVariant}
            brandName={coach.brand_name}
            iconSrc={logoUrl || BRAND_APP_ICON}
            iconSrcDark={logoUrl ? (logoUrlDark || logoUrl) : undefined}
            size="lg"
        />
    ) : (
        <EvaRouteLoader
            size="lg"
            useCustom={brandingAllowed}
            customText={brandingAllowed ? coach.brand_name : undefined}
            iconMode={logoUrl ? 'coach' : 'eva'}
            coachLogoUrl={logoUrl || undefined}
            coachLogoDarkUrl={logoUrlDark || undefined}
            primaryColor={theme.light.accent}
            showWordmark={brandingAllowed}
        />
    )

    // Sello «Hecho con EVA» (Pricing v3, D3=A — owner 2026-08-21). Reemplaza al viejo bloque
    // "con tecnología de EVA" (ícono + wordmark) que se pintaba para TODOS los tiers: el gancho
    // de Pro es justamente NO llevar atribución de EVA en la pantalla del alumno.
    // Se monta bajo el formulario en los 4 layouts (móvil y desktop): esa zona es siempre
    // `surface-card`/`surface-app` — nunca el hero teñido con el color del coach — así el
    // contraste del sello no depende del hex de la marca.
    const evaBadge = showsEvaBadge(tier) ? <EvaBadge medium="student_login" className="pt-[18px]" /> : null

    // FCN W2.8: el código de invitación va tal cual a las DOS instancias del form — es lo que
    // convierte el «¿No tienes cuenta?» en un link real a `/join/{código}`. Sin código no se pinta.
    const loginForm = (
        <ClientLoginForm
            coachSlug={coach_slug}
            primaryColor={theme.light.accent}
            brandName={coach.brand_name}
            logoUrl={logoUrl}
            errorCode={errorCode}
            inviteCode={coach.invite_code}
        />
    )

    // Instancia de form para el árbol DESKTOP — ids prefijados: móvil y desktop coexisten
    // en el DOM (uno oculto por CSS) y los `htmlFor` deben resolver a su propio input.
    const desktopLoginForm = (
        <ClientLoginForm
            coachSlug={coach_slug}
            primaryColor={theme.light.accent}
            brandName={coach.brand_name}
            logoUrl={logoUrl}
            idPrefix="d-"
            errorCode={errorCode}
            inviteCode={coach.invite_code}
        />
    )

    // ── DESKTOP (≥760): pane del form, compartido por clasico/hero/energia ──
    // Panel elevado (surface-card) con el form centrado a ancho cómodo (~420px).
    const desktopFormPane = (
        <LoginEntranceItem className="flex w-[clamp(380px,38%,560px)] flex-shrink-0 flex-col justify-center border-l border-subtle bg-surface-card px-10 py-14 shadow-[var(--shadow-xl)]">
            <div className="mx-auto w-full max-w-[420px]">
                <h2
                    className="font-display text-[26px] font-black leading-tight tracking-[-0.02em] text-text-strong"
                    style={{ fontFamily: 'var(--login-font)' }}
                >
                    Inicia sesión
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
                    Entrena con <b className="text-text-strong">{coach.brand_name}</b>
                </p>
                <div className="mt-8">{desktopLoginForm}</div>
                {evaBadge}
            </div>
        </LoginEntranceItem>
    )

    // Pane izquierdo (hero de marca GRANDE) — una expresión por variante.
    const desktopLeftClasico = (
        <LoginEntranceItem className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-12 py-16 text-center">
            <div
                aria-hidden
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(120% 100% at 50% 0%, var(--login-accent) 0%, color-mix(in oklab, var(--login-accent) 78%, black) 55%, color-mix(in oklab, var(--login-accent) 55%, black) 100%)',
                }}
            />
            <div
                aria-hidden
                className="absolute inset-0 opacity-50"
                style={{ background: 'radial-gradient(70% 55% at 20% 0%, rgba(255,255,255,0.18), transparent 60%)' }}
            />
            <div className="relative flex flex-col items-center">
                <div className="inline-flex">{brandMark(112, true)}</div>
                <h1
                    className="mt-7 font-display text-[42px] font-black leading-[1.04] tracking-[-0.02em] text-white"
                    style={{ fontFamily: 'var(--login-font)' }}
                >
                    {coach.brand_name}
                </h1>
                <p className="mx-auto mt-3 max-w-[400px] text-[17px] leading-relaxed text-white/85">{tagline}</p>
            </div>
        </LoginEntranceItem>
    )

    const desktopLeftHero = (
        <LoginEntranceItem className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-surface-app px-12 py-16 text-center">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(90% 60% at 50% 35%, color-mix(in oklab, var(--login-accent) 22%, transparent), transparent 72%)' }}
            />
            <div className="relative flex flex-col items-center">
                <div className="inline-flex">{brandMark(208, false)}</div>
                <h1
                    className="mt-9 font-display text-[40px] font-black tracking-[-0.02em] text-text-strong"
                    style={{ fontFamily: 'var(--login-font)' }}
                >
                    {coach.brand_name}
                </h1>
                <p className="mx-auto mt-3 max-w-[380px] text-[16px] leading-relaxed text-text-muted">{tagline}</p>
            </div>
        </LoginEntranceItem>
    )

    const desktopLeftEnergia = (
        <LoginEntranceItem className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-surface-app px-12 py-16 text-center">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(85% 55% at 50% 40%, color-mix(in oklab, var(--login-accent) 18%, transparent), transparent 72%)' }}
            />
            <div className="relative flex flex-col items-center" style={accentVars}>
                {coachLoaderNode}
                <p className="mx-auto mt-9 max-w-[380px] text-[16px] leading-relaxed text-text-muted">{tagline}</p>
            </div>
        </LoginEntranceItem>
    )

    const desktopLeftPane =
        layout === 'hero' ? desktopLeftHero : layout === 'energia' ? desktopLeftEnergia : desktopLeftClasico

    return (
        <div className="login-brand relative min-h-dvh w-full overflow-hidden bg-surface-app">
            {/* Acento por-modo + fuente: scoped a .login-brand para no tocar el resto del árbol. */}
            <style dangerouslySetInnerHTML={{ __html: `.login-brand{--login-accent:${theme.light.accent};--login-accent-rgb:${accentRgb};--login-font:${brandFontStack};}.dark .login-brand{--login-accent:${theme.dark.accent};}` }} />

            {/* ════════ MÓVIL (<760) — layout aprobado, intacto. Capado a max-w-md y centrado. ════════ */}
            <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden md:hidden">
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
                        {evaBadge}
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
                        {evaBadge}
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
                            Inicia sesión para entrenar con <b className="text-text-strong">{coach.brand_name}</b>
                        </p>
                        {loginForm}
                        {evaBadge}
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
                            Inicia sesión para entrenar con <b className="text-text-strong">{coach.brand_name}</b>
                        </p>
                        {loginForm}
                        {evaBadge}
                    </LoginEntranceItem>
                </LoginEntrance>
            )}
            </div>

            {/* ════════ DESKTOP (≥760) — split de 2 panes (hero de marca + form). minimal = columna ancha. ════════ */}
            {layout === 'minimal' ? (
                /* minimal desktop — una sola columna centrada, ANCHA y tipográfica (sin pane) */
                <LoginEntrance className="hidden min-h-dvh w-full flex-1 items-center justify-center px-8 py-16 md:flex">
                    <div className="w-full max-w-[520px]">
                        <LoginEntranceItem className="mb-11">
                            {logoUrl && <div className="mb-8">{brandMark(76, false)}</div>}
                            <h1
                                className="font-display text-[54px] font-black leading-[1.02] tracking-[-0.03em] text-text-strong"
                                style={{ fontFamily: 'var(--login-font)' }}
                            >
                                {coach.brand_name}
                            </h1>
                            <p className="mt-4 max-w-[440px] text-[18px] leading-relaxed text-text-muted">{tagline}</p>
                        </LoginEntranceItem>
                        <LoginEntranceItem>
                            <div className="max-w-[440px]">
                                {desktopLoginForm}
                                {evaBadge}
                            </div>
                        </LoginEntranceItem>
                    </div>
                </LoginEntrance>
            ) : (
                <LoginEntrance className="hidden min-h-dvh w-full md:flex">
                    {desktopLeftPane}
                    {desktopFormPane}
                </LoginEntrance>
            )}

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
