'use client'

import type { ComponentType } from 'react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalloutShowcaseBody, type CalloutItem } from '@/components/landing/LandingCalloutShowcase'
import {
    DioramaBrand,
    DioramaClients,
    DioramaDashboard,
    DioramaExercises,
    DioramaNutrition,
    DioramaPrograms,
} from '@/components/landing/landing-coach-dioramas'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

const PATHS_DASHBOARD = [
    'M 4 17 L 26 17 L 26 23 L 38 23',
    'M 4 48 L 25 48 L 25 53 L 38 53',
    'M 4 80 L 22 80 L 22 74 L 38 74',
    'M 96 19 L 74 19 L 74 24 L 62 24',
    'M 96 49 L 73 49 L 73 54 L 62 54',
    'M 96 78 L 76 78 L 76 72 L 62 72',
]

const PATHS_CLIENTS = [
    'M 5 20 L 28 20 L 28 26 L 38 26',
    'M 5 50 L 24 50 L 24 55 L 38 55',
    'M 5 78 L 26 78 L 26 73 L 38 73',
    'M 95 22 L 72 22 L 72 28 L 62 28',
    'M 95 50 L 71 50 L 71 56 L 62 56',
    'M 95 77 L 75 77 L 75 71 L 62 71',
]

const PATHS_PROGRAMS = PATHS_DASHBOARD
const PATHS_EXERCISES = PATHS_CLIENTS
const PATHS_NUTRITION = PATHS_DASHBOARD
const PATHS_BRAND = PATHS_CLIENTS

export type CoachPanelValue = 'dashboard' | 'clients' | 'programs' | 'exercises' | 'nutrition' | 'brand'

type CoachPanelConfig = {
    value: CoachPanelValue
    tabKey: string
    eyebrowKey: string
    titleKey: string
    left: CalloutItem[]
    right: CalloutItem[]
    svgPaths: string[]
    Diorama: ComponentType
}

const COACH_PANELS: CoachPanelConfig[] = [
    {
        value: 'dashboard',
        tabKey: 'landing.coachTab.dashboard',
        eyebrowKey: 'landing.coachSection.dashboard.eyebrow',
        titleKey: 'landing.coachSection.dashboard.title',
        left: [
            { titleKey: 'landing.coachCallout.dashboard.mrr.title', bodyKey: 'landing.coachCallout.dashboard.mrr.body' },
            { titleKey: 'landing.coachCallout.dashboard.clients.title', bodyKey: 'landing.coachCallout.dashboard.clients.body' },
            { titleKey: 'landing.coachCallout.dashboard.alerts.title', bodyKey: 'landing.coachCallout.dashboard.alerts.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.dashboard.adherence.title', bodyKey: 'landing.coachCallout.dashboard.adherence.body' },
            { titleKey: 'landing.coachCallout.dashboard.nutrition.title', bodyKey: 'landing.coachCallout.dashboard.nutrition.body' },
            { titleKey: 'landing.coachCallout.dashboard.control.title', bodyKey: 'landing.coachCallout.dashboard.control.body' },
        ],
        svgPaths: PATHS_DASHBOARD,
        Diorama: DioramaDashboard,
    },
    {
        value: 'clients',
        tabKey: 'landing.coachTab.clients',
        eyebrowKey: 'landing.coachSection.clients.eyebrow',
        titleKey: 'landing.coachSection.clients.title',
        left: [
            { titleKey: 'landing.coachCallout.clients.directory.title', bodyKey: 'landing.coachCallout.clients.directory.body' },
            { titleKey: 'landing.coachCallout.clients.pulse.title', bodyKey: 'landing.coachCallout.clients.pulse.body' },
            { titleKey: 'landing.coachCallout.clients.program.title', bodyKey: 'landing.coachCallout.clients.program.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.clients.link.title', bodyKey: 'landing.coachCallout.clients.link.body' },
            { titleKey: 'landing.coachCallout.clients.onboard.title', bodyKey: 'landing.coachCallout.clients.onboard.body' },
            { titleKey: 'landing.coachCallout.clients.detail.title', bodyKey: 'landing.coachCallout.clients.detail.body' },
        ],
        svgPaths: PATHS_CLIENTS,
        Diorama: DioramaClients,
    },
    {
        value: 'programs',
        tabKey: 'landing.coachTab.programs',
        eyebrowKey: 'landing.coachSection.programs.eyebrow',
        titleKey: 'landing.coachSection.programs.title',
        left: [
            { titleKey: 'landing.coachCallout.programs.library.title', bodyKey: 'landing.coachCallout.programs.library.body' },
            { titleKey: 'landing.coachCallout.programs.assign.title', bodyKey: 'landing.coachCallout.programs.assign.body' },
            { titleKey: 'landing.coachCallout.programs.builder.title', bodyKey: 'landing.coachCallout.programs.builder.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.programs.weeks.title', bodyKey: 'landing.coachCallout.programs.weeks.body' },
            { titleKey: 'landing.coachCallout.programs.templates.title', bodyKey: 'landing.coachCallout.programs.templates.body' },
            { titleKey: 'landing.coachCallout.programs.cta.title', bodyKey: 'landing.coachCallout.programs.cta.body' },
        ],
        svgPaths: PATHS_PROGRAMS,
        Diorama: DioramaPrograms,
    },
    {
        value: 'exercises',
        tabKey: 'landing.coachTab.exercises',
        eyebrowKey: 'landing.coachSection.exercises.eyebrow',
        titleKey: 'landing.coachSection.exercises.title',
        left: [
            { titleKey: 'landing.coachCallout.exercises.catalog.title', bodyKey: 'landing.coachCallout.exercises.catalog.body' },
            { titleKey: 'landing.coachCallout.exercises.gif.title', bodyKey: 'landing.coachCallout.exercises.gif.body' },
            { titleKey: 'landing.coachCallout.exercises.custom.title', bodyKey: 'landing.coachCallout.exercises.custom.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.exercises.groups.title', bodyKey: 'landing.coachCallout.exercises.groups.body' },
            { titleKey: 'landing.coachCallout.exercises.builder.title', bodyKey: 'landing.coachCallout.exercises.builder.body' },
            { titleKey: 'landing.coachCallout.exercises.coach.title', bodyKey: 'landing.coachCallout.exercises.coach.body' },
        ],
        svgPaths: PATHS_EXERCISES,
        Diorama: DioramaExercises,
    },
    {
        value: 'nutrition',
        tabKey: 'landing.coachTab.nutrition',
        eyebrowKey: 'landing.coachSection.nutrition.eyebrow',
        titleKey: 'landing.coachSection.nutrition.title',
        left: [
            { titleKey: 'landing.coachCallout.nutrition.plans.title', bodyKey: 'landing.coachCallout.nutrition.plans.body' },
            { titleKey: 'landing.coachCallout.nutrition.track.title', bodyKey: 'landing.coachCallout.nutrition.track.body' },
            { titleKey: 'landing.coachCallout.nutrition.macros.title', bodyKey: 'landing.coachCallout.nutrition.macros.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.nutrition.tier.title', bodyKey: 'landing.coachCallout.nutrition.tier.body' },
            { titleKey: 'landing.coachCallout.nutrition.templates.title', bodyKey: 'landing.coachCallout.nutrition.templates.body' },
            { titleKey: 'landing.coachCallout.nutrition.client.title', bodyKey: 'landing.coachCallout.nutrition.client.body' },
        ],
        svgPaths: PATHS_NUTRITION,
        Diorama: DioramaNutrition,
    },
    {
        value: 'brand',
        tabKey: 'landing.coachTab.brand',
        eyebrowKey: 'landing.coachSection.brand.eyebrow',
        titleKey: 'landing.coachSection.brand.title',
        left: [
            { titleKey: 'landing.coachCallout.brand.logo.title', bodyKey: 'landing.coachCallout.brand.logo.body' },
            { titleKey: 'landing.coachCallout.brand.color.title', bodyKey: 'landing.coachCallout.brand.color.body' },
            { titleKey: 'landing.coachCallout.brand.url.title', bodyKey: 'landing.coachCallout.brand.url.body' },
        ],
        right: [
            { titleKey: 'landing.coachCallout.brand.pwa.title', bodyKey: 'landing.coachCallout.brand.pwa.body' },
            { titleKey: 'landing.coachCallout.brand.student.title', bodyKey: 'landing.coachCallout.brand.student.body' },
            { titleKey: 'landing.coachCallout.brand.welcome.title', bodyKey: 'landing.coachCallout.brand.welcome.body' },
        ],
        svgPaths: PATHS_BRAND,
        Diorama: DioramaBrand,
    },
]

function CoachPanelBody({ panel }: { panel: CoachPanelConfig }) {
    const { t } = useTranslation()
    const DioramaCmp = panel.Diorama

    return (
        <motion.div
            key={panel.value}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
        >
            <div className="mb-6 max-w-2xl">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {t(panel.eyebrowKey)}
                </span>
                <h3 className="font-display text-lg font-black tracking-tight text-foreground sm:text-xl md:text-2xl">
                    {t(panel.titleKey)}
                </h3>
            </div>
            <CalloutShowcaseBody left={panel.left} right={panel.right} svgPaths={panel.svgPaths}>
                <DioramaCmp />
            </CalloutShowcaseBody>
        </motion.div>
    )
}

export function LandingCoachTabs() {
    const { t } = useTranslation()
    const [tab, setTab] = useState<CoachPanelValue>('dashboard')

    return (
        <section
            id="panel-coach"
            className="landing-section-coach w-full scroll-mt-28 border-t border-border/50 py-14 sm:py-16 lg:py-20"
        >
            <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">
                <motion.header
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    className="mx-auto max-w-2xl text-center"
                >
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.coachTabs.eyebrow')}
                    </span>
                    <h2 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl md:text-4xl">
                        {t('landing.coachTabs.title')}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{t('landing.coachTabs.subtitle')}</p>
                </motion.header>

                <div role="region" aria-label={t('landing.coachTabs.tabsRegionAria')}>
                    <Tabs
                        value={tab}
                        onValueChange={(v) => setTab(v as CoachPanelValue)}
                        className="mt-8 flex w-full flex-col gap-0 lg:gap-1"
                    >
                        <div className="w-full min-w-0 lg:flex lg:justify-center">
                            <TabsList
                                variant="line"
                                className={cn(
                                    '!h-auto min-h-11 w-full min-w-0 flex-nowrap justify-start gap-0 border-b border-border bg-transparent p-0',
                                    'overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch] snap-x snap-mandatory',
                                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                                    'lg:inline-flex lg:w-auto lg:max-w-[min(100%,56rem)] lg:flex-wrap lg:justify-center lg:gap-x-1 lg:overflow-x-visible'
                                )}
                            >
                                {COACH_PANELS.map((p) => {
                                    const isActive = tab === p.value
                                    return (
                                        <TabsTrigger
                                            key={p.value}
                                            value={p.value}
                                            id={`panel-coach-tab-${p.value}`}
                                            className={cn(
                                                'relative min-h-11 shrink-0 !flex-none snap-start rounded-none px-3 py-2.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm',
                                                'after:!hidden',
                                                isActive
                                                    ? '!text-foreground !font-bold'
                                                    : '!text-muted-foreground hover:!text-foreground'
                                            )}
                                        >
                                            <span className="relative z-10">{t(p.tabKey)}</span>
                                            {isActive ? (
                                                <motion.span
                                                    layoutId="coach-tabs-underline"
                                                    className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-primary"
                                                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                                                    aria-hidden
                                                />
                                            ) : null}
                                        </TabsTrigger>
                                    )
                                })}
                            </TabsList>
                        </div>

                        <div className="min-w-0 pt-6">
                            <AnimatePresence mode="wait" initial={false}>
                                {COACH_PANELS.map((panel) =>
                                    panel.value === tab ? (
                                        <TabsContent key={panel.value} value={panel.value} className="mt-0 outline-none">
                                            <CoachPanelBody panel={panel} />
                                        </TabsContent>
                                    ) : null
                                )}
                            </AnimatePresence>
                        </div>
                    </Tabs>
                </div>
            </div>
        </section>
    )
}
