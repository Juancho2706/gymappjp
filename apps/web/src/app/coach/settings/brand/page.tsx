import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Palette } from 'lucide-react'
import type { Metadata } from 'next'
import { BrandSettingsForm } from '../BrandSettingsForm'
import { LogoUploadForm } from '../LogoUploadForm'
import { BrandSettingsTourClient } from '../_components/BrandSettingsTourClient'
import { BrandUpsell } from '../_components/BrandUpsell'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { getCoachSettingsForUser } from '../_data/settings.queries'

export const metadata: Metadata = {
    title: 'Mi Marca | EVA',
}

export default async function CoachBrandPage() {
    const { user, coach } = await getCoachSettingsForUser()
    if (!user) redirect('/login')
    if (!coach) redirect('/login')
    // El branding lo gestiona EVA/el equipo en estos contextos: no hay marca propia del coach acá.
    if (coach.subscription_status === 'org_managed') redirect('/coach/dashboard')
    if (coach.subscription_status === 'team_managed') redirect('/coach/settings')

    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const capabilities = getTierCapabilities(tier)

    // Sin branding (free tier): esta ruta ES el upsell (kit: card Mi Marca badge Pro → miMarcaUpsell).
    if (!capabilities.canUseBranding) {
        return (
            <div className="mx-auto max-w-3xl animate-fade-in space-y-4 px-4 py-6 md:px-8">
                <Link
                    href="/coach/settings"
                    className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Opciones
                </Link>
                <BrandUpsell tier={tier} />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-3xl animate-fade-in px-4 py-6 md:px-8 lg:max-w-6xl" data-tour-id="brand-header">
            <div className="mb-6 space-y-4">
                <Link
                    href="/coach/settings"
                    className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Opciones
                </Link>

                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control" style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}>
                        <Palette className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="font-display text-2xl font-black tracking-tight text-strong">
                            Mi Marca
                        </h1>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                            Personaliza la app de tus alumnos: logo, colores, nombre y mensajes.
                            Cada alumno ve <span className="font-semibold text-strong">TU marca</span>, no la de EVA — instalan tu app como si fuera tuya.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Logo upload */}
                <LogoUploadForm
                    currentLogoUrl={coach.logo_url}
                    brandName={coach.brand_name}
                />

                {/* Brand settings form */}
                <BrandSettingsForm coach={coach} />
            </div>

            <BrandSettingsTourClient
                coachId={coach.id}
                brandTourSeenServer={
                    typeof coach.onboarding_guide === 'object' &&
                    coach.onboarding_guide !== null &&
                    !Array.isArray(coach.onboarding_guide) &&
                    (coach.onboarding_guide as Record<string, unknown>).brand_tour_seen === true
                }
            />
        </div>
    )
}
