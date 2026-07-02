'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, Bell, ChevronDown } from 'lucide-react'
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
import { WorkspaceSwitchSheet } from './sheets/WorkspaceSwitchSheet'
import { CoachOnboardingChecklist } from '../CoachOnboardingChecklist'
import { todayLabel } from '../_lib/dashboard-design'
import type { DashboardV2Data } from '../_data/types'
import type { WorkspaceSummary } from '@/domain/auth/types'
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
    /** Logo de marca del coach — usado como tile del avatar del header móvil (fallback iniciales). */
    coachLogoUrl?: string | null
    workspaces: WorkspaceSummary[]
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
    coachLogoUrl,
    workspaces,
}: Props) {
    const [statsSheetOpen, setStatsSheetOpen] = useState(false)
    const [wsSheetOpen, setWsSheetOpen] = useState(false)
    const firstName = coachName?.split(' ')[0] || 'Coach'
    const openInsights = () => setStatsSheetOpen(true)
    // Multi-workspace ⇒ el avatar abre el switcher de espacio (bottom-sheet). Con un solo
    // espacio el avatar sigue navegando a Opciones y NO lleva caret (misma condición que el
    // topbar desktop: workspaces.length > 1).
    const hasMultiWorkspace = workspaces.length > 1

    return (
        <>
            <Suspense>
                <FreeWelcomeModal />
            </Suspense>

            {/* Sin px propio: el gutter lateral lo da CoachMainWrapper (px-4/md:px-8) — evita el
                doble padding (36px) que estrechaba todo en móvil vs el diseño (~20px).
                Móvil: `-mt-6` cancela el `py-6` (24px) top del contenedor de CoachMainWrapper
                (que NO se toca) para que el saludo arranque cerca del top; el único aire que queda
                es el `--mobile-content-top-offset` (safe-area del notch + 1rem) que aplica el
                wrapper. Desktop conserva su spacing (`md:mt-0` + el `md:py-10` del wrapper).
                Estructural: la fuente real del gap vive en CoachMainWrapper.tsx:54 (pt-offset) +
                CoachMainWrapper.tsx:72 (py-6) — al ser compartido con /c del alumno se neutraliza
                acá en vez de tocar el wrapper. */}
            <div className="relative z-10 mx-auto -mt-6 w-full pb-10 md:mt-0 md:pt-2">
                {/* Billing / tier banners (functional — not part of the design tree). `empty:hidden`
                    colapsa el bloque (y su margen) cuando no hay ningún banner que mostrar → sin
                    aire muerto extra bajo el notch para coaches sin avisos. */}
                <div className="mb-4 empty:hidden">
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
                    <header className="flex items-center justify-between pb-3.5">
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
                            {/* Avatar de espacio. Con >1 workspace: botón con caret que abre el
                                switcher de espacio (bottom-sheet). Con 1 solo: link a Opciones,
                                sin caret. */}
                            {hasMultiWorkspace ? (
                                <button
                                    type="button"
                                    onClick={() => setWsSheetOpen(true)}
                                    aria-label="Cambiar de espacio"
                                    className="relative shrink-0"
                                >
                                    <HeaderBrandTile logoUrl={coachLogoUrl} name={coachName} />
                                    <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-[var(--surface-app)] bg-surface-card text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
                                        <ChevronDown className="size-3" />
                                    </span>
                                </button>
                            ) : (
                                <Link
                                    href="/coach/settings"
                                    aria-label="Tu cuenta"
                                    className="relative shrink-0"
                                >
                                    <HeaderBrandTile logoUrl={coachLogoUrl} name={coachName} />
                                </Link>
                            )}
                        </div>
                    </header>

                    <PulseHero kpi={data.kpi} onAdherence={openInsights} />

                    <div className="mb-[22px]">
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

                    <div className="mb-[18px]">
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

            {hasMultiWorkspace && (
                <WorkspaceSwitchSheet
                    open={wsSheetOpen}
                    onOpenChange={setWsSheetOpen}
                    workspaces={workspaces}
                />
            )}
        </>
    )
}

/**
 * Tile de marca del header móvil — espejo del avatar de cuenta del topbar desktop
 * (CoachTopBar): si el coach tiene logo, tile circular con `object-contain` sobre fondo
 * (blanco en light / superficie hundida en dark); si no, cae a las iniciales con anillo sport.
 * Tamaño `md` (40px) para igualar la huella del avatar previo del header.
 */
function HeaderBrandTile({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
    if (logoUrl) {
        return (
            <span className="relative size-10 shrink-0 overflow-hidden rounded-full border border-subtle bg-white dark:bg-[var(--surface-sunken)]">
                <Image src={logoUrl} alt={name} fill sizes="40px" className="object-contain p-1.5" />
            </span>
        )
    }
    return <Avatar name={name} size="md" ring="sport" />
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
