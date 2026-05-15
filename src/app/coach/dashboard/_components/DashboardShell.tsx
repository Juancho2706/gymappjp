'use client'

import dynamic from 'next/dynamic'
import { Suspense, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BillingBanners } from './banners/BillingBanners'
import { FreeWelcomeModal } from './FreeWelcomeModal'
import { GreetingHeader } from './header/GreetingHeader'
import { QuickActionsBar } from './header/QuickActionsBar'
import { KpiStrip } from './kpi/KpiStrip'
import { FocusList } from './focus/FocusList'
import { NextBestAction } from './cs/NextBestAction'
import { TodayAgenda } from './today/TodayAgenda'
import { ExpiringPrograms } from './expiring/ExpiringPrograms'
import { ActivityFeed } from './activity/ActivityFeed'
import { ClientStatsSheet } from './sheets/ClientStatsSheet'
import { RevenueSheet } from './sheets/RevenueSheet'
import { CoachOnboardingChecklist } from '../CoachOnboardingChecklist'
import { resolveNextBestAction } from '../_lib/nextBestAction.rules'
import type { DashboardV2Data } from '../_data/types'

const DashboardCharts = dynamic(
    () =>
        import('@/components/coach/dashboard/DashboardCharts').then((m) => ({
            default: m.DashboardCharts,
        })),
    {
        ssr: false,
        loading: () => (
            <div className="h-64 w-full animate-pulse rounded-2xl bg-muted/40" aria-hidden />
        ),
    }
)

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const } },
}

import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { TIER_CONFIG } from '@/lib/constants'
import Link from 'next/link'

interface Props {
    data: DashboardV2Data
    coachId: string
    coachName: string
    coachSlug: string
    absoluteStudentAppUrl: string
    initialOnboardingGuide: Json
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
}

export function DashboardShell({
    data,
    coachId,
    coachName,
    coachSlug,
    absoluteStudentAppUrl,
    initialOnboardingGuide,
    subscriptionTier,
    hasCoachLogo,
}: Props) {
    const [statsSheetOpen, setStatsSheetOpen] = useState(false)
    const [revenueSheetOpen, setRevenueSheetOpen] = useState(false)

    const nextAction = useMemo(() => resolveNextBestAction(data), [data])
    const pendingCount = data.agenda.length + data.topRiskClients.length

    return (
        <>
            <AmbientBackground />
            <Suspense>
                <FreeWelcomeModal />
            </Suspense>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 flex flex-col gap-6 p-4 pb-24 sm:p-6 lg:p-8"
            >
                <motion.div variants={itemVariants}>
                    <BillingBanners
                        subscriptionStatus={data.subscriptionStatus}
                        currentPeriodEnd={data.currentPeriodEnd}
                        trialEndsAt={data.trialEndsAt}
                        activeClientCount={data.kpi.totalClients}
                    />
                    {subscriptionTier === 'free' && (
                        <FreeTierBanner totalClients={data.kpi.totalClients} />
                    )}
                    {subscriptionTier === 'elite' && data.kpi.totalClients >= 48 && (
                        <GrowthUpgradeBanner totalClients={data.kpi.totalClients} />
                    )}
                </motion.div>

                <motion.header
                    variants={itemVariants}
                    className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
                >
                    <GreetingHeader coachName={coachName} pendingCount={pendingCount} />
                    <QuickActionsBar clients={data.clientList} />
                </motion.header>

                <motion.section variants={itemVariants}>
                    <CoachOnboardingChecklist
                        coachId={coachId}
                        coachSlug={coachSlug}
                        absoluteStudentAppUrl={absoluteStudentAppUrl}
                        initialOnboardingGuide={initialOnboardingGuide}
                        totalClients={data.kpi.totalClients}
                        activePlans={data.activePlans}
                        hasStudentSignal30d={data.hasStudentSignal30d}
                        subscriptionTier={subscriptionTier}
                        hasCoachLogo={hasCoachLogo}
                    />
                </motion.section>

                <motion.section variants={itemVariants}>
                    <KpiStrip kpi={data.kpi} onAdherenceClick={() => setStatsSheetOpen(true)} onMrrClick={() => setRevenueSheetOpen(true)} />
                </motion.section>

                <motion.section variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <FocusList items={data.topRiskClients} />
                    </div>
                    <div className="lg:col-span-4">
                        <NextBestAction action={nextAction} />
                    </div>
                </motion.section>

                <motion.section variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <TodayAgenda items={data.agenda} />
                    </div>
                    <div className="lg:col-span-4">
                        <ExpiringPrograms items={data.expiringPrograms} />
                    </div>
                </motion.section>

                <motion.section variants={itemVariants}>
                    <ActivityFeed items={data.recentActivities} />
                </motion.section>

                <motion.section variants={itemVariants}>
                    <DashboardCharts areaData={data.areaData} barData={data.barData} />
                </motion.section>

            </motion.div>

            <ClientStatsSheet
                open={statsSheetOpen}
                onOpenChange={setStatsSheetOpen}
                adherenceStats={data.adherenceStats}
                nutritionStats={data.nutritionStats}
            />
            <RevenueSheet
                open={revenueSheetOpen}
                onOpenChange={setRevenueSheetOpen}
                kpi={data.kpi}
                clientPaymentSummary={data.clientPaymentSummary}
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
        <div className={`mt-3 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
            full
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-border bg-card/60'
        }`}>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">
                    {used}/{max} alumnos · Plan gratuito
                </p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${full ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <Link
                href="/coach/subscription"
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
            >
                {full ? 'Expandir límite →' : 'Ver planes →'}
            </Link>
        </div>
    )
}

function GrowthUpgradeBanner({ totalClients }: { totalClients: number }) {
    const max = TIER_CONFIG.elite.maxClients
    const pct = Math.round((Math.min(totalClients, max) / max) * 100)

    return (
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">
                    {totalClients}/{max} alumnos · {pct}% de tu plan Elite
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Hay un plan Growth para coaches con 60–120 alumnos
                </p>
            </div>
            <Link
                href="/coach/subscription?upgrade=growth"
                className="shrink-0 text-xs font-semibold text-emerald-500 hover:underline"
            >
                Ver Growth →
            </Link>
        </div>
    )
}

function AmbientBackground() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
            <div
                className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full blur-3xl opacity-[0.08]"
                style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
            />
            <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-sky-400/10 blur-3xl" />
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage:
                        'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />
        </div>
    )
}
