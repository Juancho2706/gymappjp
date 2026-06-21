import { Dumbbell } from 'lucide-react'
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

    return (
        <div className="login-brand relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe bg-background overflow-hidden">
            {/* Acento por-modo + fuente: scoped a .login-brand para no tocar el resto del árbol. */}
            <style dangerouslySetInnerHTML={{ __html: `.login-brand{--login-accent:${theme.light.accent};--login-accent-rgb:${accentRgb};--login-font:${brandFontStack};}.dark .login-brand{--login-accent:${theme.dark.accent};}` }} />
            {/* Ambient glow using the resolved brand accent (gated). */}
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    background: 'radial-gradient(ellipse 90% 55% at 50% -10%, rgb(var(--login-accent-rgb) / 0.13), transparent 65%)',
                }}
            />
            {/* Subtle grid */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
                aria-hidden
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.1) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <LoginEntrance className="relative z-10 w-full max-w-sm">
                {/* Coach brand header */}
                <LoginEntranceItem className="text-center mb-7">
                    <div className="flex justify-center mb-4">
                        {logoUrl ? (
                            <div
                                className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                                style={{ borderColor: 'rgb(var(--login-accent-rgb) / 0.19)', boxShadow: '0 8px 32px rgb(var(--login-accent-rgb) / 0.12)' }}
                            >
                                <Image
                                    src={logoUrl}
                                    alt={coach.brand_name}
                                    fill
                                    className="object-contain p-2"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                                style={{
                                    backgroundColor: 'rgb(var(--login-accent-rgb) / 0.08)',
                                    borderColor: 'rgb(var(--login-accent-rgb) / 0.19)',
                                    boxShadow: '0 8px 32px rgb(var(--login-accent-rgb) / 0.08)',
                                }}
                            >
                                <Dumbbell className="w-9 h-9" style={{ color: 'var(--login-accent)' }} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--login-font)' }}>
                        {coach.brand_name}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                        {coach.welcome_message?.trim() || 'Tu plataforma de entrenamiento personalizado'}
                    </p>
                </LoginEntranceItem>

                {/* Login form */}
                <LoginEntranceItem>
                    <ClientLoginForm
                        coachSlug={coach_slug}
                        primaryColor={theme.light.accent}
                        brandName={coach.brand_name}
                        logoUrl={logoUrl}
                    />
                </LoginEntranceItem>

                {/* Powered by EVA */}
                <LoginEntranceItem>
                    <p className="mt-5 text-center text-xs text-muted-foreground/60">
                        Impulsado por{' '}
                        <span className="font-semibold text-muted-foreground">EVA</span>
                    </p>
                </LoginEntranceItem>
            </LoginEntrance>

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
