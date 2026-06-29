'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Bell } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { BillingBanners } from './banners/BillingBanners'
import { FreeWelcomeModal } from './FreeWelcomeModal'
import { PulseHero } from './PulseHero'
import { PriorityCard } from './PriorityCard'
import { AgendaCard } from './AgendaCard'
import { NewsFeed } from './NewsFeed'
import { DashboardFab } from './DashboardFab'
import { DesktopBento } from './DesktopBento'
import { ClientStatsSheet } from './sheets/ClientStatsSheet'
import { CoachOnboardingChecklist } from '../CoachOnboardingChecklist'
import { todayLabel } from '../_lib/dashboard-design'
import type { DashboardV2Data } from '../_data/types'
import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { TIER_CONFIG } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Props {
    data: DashboardV2Data
    coachId: string
    coachName: string
    coachSlug: string
    coachInviteCode?: string | null
    initialOnboardingGuide: Json
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
}

export function DashboardShell({
    data,
    coachId,
    coachName,
    coachSlug,
    coachInviteCode,
    initialOnboardingGuide,
    subscriptionTier,
    hasCoachLogo,
}: Props) {
    const [statsSheetOpen, setStatsSheetOpen] = useState(false)
    const firstName = coachName?.split(' ')[0] || 'Coach'
    const openInsights = () => setStatsSheetOpen(true)

    return (
        <>
            <Suspense>
                <FreeWelcomeModal />
            </Suspense>

            <div className="relative z-10 mx-auto w-full max-w-[1100px] px-5 pb-10 pt-2 sm:px-6 lg:px-8">
                {/* Billing / tier banners (functional — not part of the design tree) */}
                <div className="mb-4">
                    <BillingBanners
                        subscriptionStatus={data.subscriptionStatus}
                        currentPeriodEnd={data.currentPeriodEnd}
                        trialEndsAt={data.trialEndsAt}
                        activeClientCount={data.kpi.totalClients}
                    />
                    {subscriptionTier === 'free' && (
                        <FreeTierBanner totalClients={data.kpi.totalClients} />
                    )}
                    {subscriptionTier === 'elite' && data.kpi.totalClients >= 80 && (
                        <TeamsBridgeBanner totalClients={data.kpi.totalClients} />
                    )}
                </div>

                {/* ───────── Mobile (eva-app structure, <md) ───────── */}
                <div className="md:hidden">
                    <header className="flex items-center justify-between pb-3.5 pt-1.5">
                        <div>
                            <div className="text-[13px] font-semibold text-[var(--text-muted)]">
                                {todayLabel()}
                            </div>
                            <h1 className="font-display text-[28px] font-black leading-[1.05] tracking-[-0.03em] text-[var(--text-strong)]">
                                Hola, {firstName}
                            </h1>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={openInsights}
                                aria-label="Insights"
                                className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-[var(--text-strong)] transition-colors hover:bg-surface-sunken"
                            >
                                <Sparkles className="size-[19px]" />
                            </button>
                            <button
                                type="button"
                                aria-label="Notificaciones"
                                className="relative flex size-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-[var(--text-strong)] transition-colors hover:bg-surface-sunken"
                            >
                                <Bell className="size-[19px]" />
                                <span className="absolute right-[9px] top-2 size-2 rounded-full border-2 border-[var(--surface-card)] bg-[var(--danger-500)]" />
                            </button>
                            <Link
                                href="/coach/settings"
                                aria-label="Tu espacio"
                                className="shrink-0"
                            >
                                <Avatar name={coachName} size="md" ring="sport" />
                            </Link>
                        </div>
                    </header>

                    <PulseHero kpi={data.kpi} onAdherence={openInsights} />

                    <div className="mb-5">
                        <PriorityCard
                            items={data.topRiskClients}
                            showNextStep
                            agendaPending={data.agenda.length}
                            expiringOverdue={
                                data.expiringPrograms.filter((p) => p.daysLeft <= 0).length
                            }
                            avgAdherence={data.kpi.avgAdherence}
                        />
                    </div>

                    <div className="mb-6">
                        <AgendaCard items={data.agenda} />
                    </div>

                    <div className="mb-4">
                        <NewsFeed
                            expiring={data.expiringPrograms}
                            activities={data.recentActivities}
                        />
                    </div>
                </div>

                {/* ───────── Desktop (eva-desktop bento, md+) ───────── */}
                <div className="hidden md:block">
                    <DesktopBento data={data} coachName={coachName} onAdherence={openInsights} />
                </div>

                {/* Guía de inicio — onboarding engine (real signals + server actions) */}
                <div className="mt-5">
                    <CoachOnboardingChecklist
                        coachId={coachId}
                        coachSlug={coachSlug}
                        coachInviteCode={coachInviteCode}
                        initialOnboardingGuide={initialOnboardingGuide}
                        totalClients={data.kpi.totalClients}
                        activePlans={data.activePlans}
                        hasStudentSignal30d={data.hasStudentSignal30d}
                        subscriptionTier={subscriptionTier}
                        hasCoachLogo={hasCoachLogo}
                    />
                </div>
            </div>

            <DashboardFab />

            <ClientStatsSheet
                open={statsSheetOpen}
                onOpenChange={setStatsSheetOpen}
                adherenceStats={data.adherenceStats}
                nutritionStats={data.nutritionStats}
            />
        </>
    )
}

function FreeTierBanner({ totalClients }: { totalClients: number }) {
    const max = TIER_CONFIG.free.maxClients
    const used = Math.min(totalClients, max)
    const pct = Math.round((used / max) * 100)
    const full = used >= max

    return (
        <div
            className={cn(
                'mt-3 flex items-center justify-between gap-4 rounded-card border px-4 py-3',
                full
                    ? 'border-[var(--warning-500)]/30 bg-[var(--warning-100)]'
                    : 'border-border-subtle bg-surface-card'
            )}
        >
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--text-strong)]">
                    {used}/{max} alumnos · Plan gratuito
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-[var(--track)]">
                    <div
                        className={cn(
                            'h-full rounded-pill transition-all',
                            full ? 'bg-[var(--warning-500)]' : 'bg-[var(--success-500)]'
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <Link
                href="/coach/subscription"
                className="shrink-0 text-xs font-bold text-sport-500 hover:underline"
            >
                {full ? 'Expandir límite →' : 'Ver planes →'}
            </Link>
        </div>
    )
}

function TeamsBridgeBanner({ totalClients }: { totalClients: number }) {
    const max = TIER_CONFIG.elite.maxClients
    const pct = Math.round((Math.min(totalClients, max) / max) * 100)

    return (
        <div className="mt-3 flex items-center justify-between gap-4 rounded-card border border-[var(--success-500)]/30 bg-[var(--success-100)] px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--text-strong)]">
                    {totalClients}/{max} alumnos · {pct}% de tu plan Elite
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    ¿Más de 100 alumnos o trabajas con otros profesionales? Conoce EVA Teams
                </p>
            </div>
            <a
                href="mailto:contacto@eva-app.cl?subject=Quiero%20conocer%20EVA%20Teams"
                className="shrink-0 text-xs font-bold text-[var(--success-600)] hover:underline"
            >
                Conversemos →
            </a>
        </div>
    )
}
