import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { BrandSettingsForm } from '../BrandSettingsForm'
import { LogoUploadForm } from '../LogoUploadForm'
import { WhatChangesList } from '../_components/WhatChangesList'
import { BrandSettingsTourClient } from '../_components/BrandSettingsTourClient'
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

    // Sin branding (free tier): el hub /coach/settings ya muestra el upsell. Volver allí.
    if (!capabilities.canUseBranding) redirect('/coach/settings')

    return (
        <div className="px-4 py-6 md:px-8 max-w-3xl lg:max-w-6xl animate-fade-in mx-auto" data-tour-id="brand-header">
            <div className="mb-6 space-y-4">
                <Link
                    href="/coach/settings"
                    className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Opciones
                </Link>

                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                            Personaliza la app de tus alumnos
                        </h1>
                        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                            Tus alumnos instalan tu app como si fuera tuya. Aquí defines cómo se ve: logo, colores, nombre y mensajes.
                            Cada alumno ve <span className="font-semibold text-foreground">TU marca</span>, no la de EVA.
                        </p>
                    </div>
                </div>

                <WhatChangesList />
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
