import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BrandSettingsForm } from './BrandSettingsForm'
import { LogoUploadForm } from './LogoUploadForm'
import { WhatChangesList } from './_components/WhatChangesList'
import { BrandSettingsTourClient } from './_components/BrandSettingsTourClient'
import type { Tables } from '@/lib/database.types'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'

type Coach = Tables<'coaches'>
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Mi Marca | EVA',
}

export default async function CoachSettingsPage() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawCoach } = await supabase
        .from('coaches')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

    if (!rawCoach) redirect('/login')
    const coach = rawCoach as Coach
    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const capabilities = getTierCapabilities(tier)

    if (!capabilities.canUseBranding) {
        return (
            <div className="p-8 max-w-3xl animate-fade-in">
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h1 className="text-2xl font-extrabold text-foreground">Mi Marca</h1>
                    <p className="text-muted-foreground text-sm mt-2">
                        Tu plan actual no incluye branding personalizado. Haz upgrade para desbloquear logo, color y
                        configuración visual de marca.
                    </p>
                    <Link
                        href="/coach/subscription"
                        className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
                    >
                        Ver planes disponibles
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="px-4 py-6 md:px-8 max-w-3xl lg:max-w-6xl animate-fade-in mx-auto" data-tour-id="brand-header">
            <div className="mb-6 space-y-4">
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

            <BrandSettingsTourClient coachId={coach.id} />
        </div>
    )
}

