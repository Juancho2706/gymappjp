import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BrandSettingsForm } from './BrandSettingsForm'
import { LogoUploadForm } from './LogoUploadForm'
import { WhatChangesList } from './_components/WhatChangesList'
import { BrandSettingsTourClient } from './_components/BrandSettingsTourClient'
import type { Tables } from '@/lib/database.types'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { Check, Palette } from 'lucide-react'
import { UpgradeGateTracker } from '@/components/analytics/UpgradeGateTracker'

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
            <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in space-y-4">
            <UpgradeGateTracker gate="branding" currentTier={tier} />
                {/* Hero */}
                <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-card to-card p-6">
                    <div className="relative z-10">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/20 mb-4">
                            <Palette className="h-6 w-6 text-sky-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-foreground">Mi Marca</h1>
                        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                            Tus alumnos entran a <span className="font-semibold text-foreground">tu app</span> — con tu logo, tus colores y tu nombre. Disponible en Starter.
                        </p>
                    </div>
                    <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl" />
                </div>

                {/* Before / after app mockup */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <div className="flex items-center gap-2 bg-[#007AFF] px-3 py-2.5">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                                <span className="text-[9px] font-bold text-white">E</span>
                            </div>
                            <span className="text-[11px] font-semibold text-white/90">EVA Fitness</span>
                        </div>
                        <div className="space-y-2 p-3">
                            <div className="h-2 w-full rounded-full bg-[#007AFF]/15" />
                            <div className="h-1.5 w-3/4 rounded-full bg-muted" />
                            <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                            <div className="mt-2.5 h-7 w-full rounded-lg bg-[#007AFF]/10 border border-[#007AFF]/20" />
                            <div className="h-7 w-full rounded-lg bg-muted/50" />
                        </div>
                        <p className="px-3 pb-3 text-[10px] text-muted-foreground/60">Sin tu marca (ahora)</p>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-sky-400/40 bg-card">
                        <div className="flex items-center gap-2 bg-sky-500 px-3 py-2.5">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25">
                                <span className="text-[9px] font-bold text-white">T</span>
                            </div>
                            <span className="text-[11px] font-semibold text-white">Tu Marca</span>
                        </div>
                        <div className="space-y-2 p-3">
                            <div className="h-2 w-full rounded-full bg-sky-400/25" />
                            <div className="h-1.5 w-3/4 rounded-full bg-sky-400/15" />
                            <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                            <div className="mt-2.5 h-7 w-full rounded-lg bg-sky-500/15 border border-sky-500/25" />
                            <div className="h-7 w-full rounded-lg bg-muted/50" />
                        </div>
                        <p className="px-3 pb-3 text-[10px] font-medium text-sky-400">Con Starter ✓</p>
                    </div>
                </div>

                {/* Pricing + features + CTA */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponible en Starter</p>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1.5">
                            <span className="text-2xl font-extrabold text-foreground">$19.990</span>
                            <span className="text-sm text-muted-foreground">/mes</span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-sm font-semibold text-sky-400">$15.992/mes anual</span>
                            <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-500">−20%</span>
                        </div>
                    </div>

                    <ul className="space-y-2.5">
                        {[
                            'Tu logo en la app del alumno',
                            'Colores y nombre de tu marca',
                            'Loader y pantalla de carga personalizados',
                            'Hasta 10 alumnos activos',
                        ].map((feat) => (
                            <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                                {feat}
                            </li>
                        ))}
                    </ul>

                    <Link
                        href="/coach/subscription?upgrade=starter"
                        className="flex h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400 transition-colors"
                    >
                        Personalizá tu app con Starter →
                    </Link>
                    <p className="text-center text-xs text-muted-foreground">Sin permanencia · Cancelá cuando quieras</p>
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

