import { notFound } from 'next/navigation'
import Image from 'next/image'
import ClientLoginForm from './ClientLoginForm'
import type { Metadata } from 'next'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { LoginEntrance, LoginEntranceItem } from './_components/LoginEntrance'
import { getClientLoginCoach, getClientLoginMetadataCoach } from './_data/login.queries'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { resolveBrandTheme } from '@eva/brand-kit'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { generateBrandPalette } from '@/lib/color-utils'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'

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

    // white-label v2: branding pre-auth = Pro+ ENTERO. free/starter → EVA visual (color/logo EVA),
    // conservando el NOMBRE del coach (identidad). Cierra el gate-leak (la query antes no miraba tier).
    const brandingAllowed = isBrandingAllowed((coach.subscription_tier ?? 'free') as SubscriptionTier)
    const brandColor = brandingAllowed ? (coach.primary_color || BRAND_PRIMARY_COLOR) : BRAND_PRIMARY_COLOR
    const theme = resolveBrandTheme({
        brandColor,
        accentLight: brandingAllowed ? (coach.accent_light || null) : null,
        accentDark: brandingAllowed ? (coach.accent_dark || null) : null,
        secondaryLight: brandingAllowed ? (coach.brand_secondary_color || null) : null,
        secondaryDark: brandingAllowed ? (coach.brand_secondary_color || null) : null,
    })
    const accentRgb = generateBrandPalette(theme.light.accent).primaryRgb.replace(/,\s*/g, ' ')
    const logoUrl = brandingAllowed ? coach.logo_url : null
    // Fuente solo en el wordmark/título (decisión #4); inputs/cuerpo en Inter (primera pantalla, sin cache).
    const brandFontStack = resolveBrandFontStack(brandingAllowed ? (coach.brand_font_key ?? '') : '')

    const initials = brandInitials(coach.brand_name)
    const tagline = coach.welcome_message?.trim() || 'Tu plataforma de entrenamiento personalizado'

    return (
        <div className="login-brand relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-surface-app">
            {/* Acento por-modo + fuente: scoped a .login-brand para no tocar el resto del árbol. */}
            <style dangerouslySetInnerHTML={{ __html: `.login-brand{--login-accent:${theme.light.accent};--login-accent-rgb:${accentRgb};--login-font:${brandFontStack};}.dark .login-brand{--login-accent:${theme.dark.accent};}` }} />

            <LoginEntrance className="flex flex-1 flex-col">
                {/* ── Hero full-bleed con el color del coach (variante Inmersivo del diseño) ── */}
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
                        {/* Brand-mark: logo del coach o iniciales sobre vidrio (onDark) */}
                        <div className="inline-flex">
                            {logoUrl ? (
                                <div
                                    className="relative flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-xl"
                                    style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                                >
                                    <Image src={logoUrl} alt={coach.brand_name} fill className="object-contain p-2.5" />
                                </div>
                            ) : (
                                <div
                                    className="flex h-[76px] w-[76px] items-center justify-center rounded-xl font-display text-[27px] font-black text-white"
                                    style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                                >
                                    {initials}
                                </div>
                            )}
                        </div>
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

                {/* ── Sheet con esquinas redondeadas que se superpone al hero ── */}
                <LoginEntranceItem className="relative z-[2] -mt-[26px] flex-1 rounded-t-[var(--radius-2xl)] bg-surface-app px-6 pb-7 pt-[26px]">
                    <p className="mb-[18px] text-center text-[13px] text-text-muted">
                        Iniciá sesión para entrenar con <b className="text-text-strong">{coach.brand_name}</b>
                    </p>

                    <ClientLoginForm
                        coachSlug={coach_slug}
                        primaryColor={theme.light.accent}
                        brandName={coach.brand_name}
                        logoUrl={logoUrl}
                    />

                    {/* Powered by EVA */}
                    <div className="flex items-center justify-center gap-1.5 pt-[18px] text-[11px] text-text-subtle">
                        con tecnología de
                        <span className="font-semibold text-text-muted">EVA</span>
                    </div>
                </LoginEntranceItem>
            </LoginEntrance>

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
