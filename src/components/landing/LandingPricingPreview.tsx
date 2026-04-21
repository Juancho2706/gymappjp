'use client'

import Link from 'next/link'
import { Check, Crown, Dumbbell, Rocket, Zap } from 'lucide-react'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierPriceClp,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const cycleOrder: BillingCycle[] = ['monthly', 'quarterly', 'annual']

/** Alineado con `SHARED_TIER_FEATURES` y nutrición en `TIER_CONFIG` */
const TIER_FEATURE_I18N_KEY: Record<string, string> = {
    'Rutinas ilimitadas con GIFs': 'landing.tierFeature.routinesUnlimited',
    'Catálogo de ejercicios con GIF': 'landing.tierFeature.catalogGif',
    'Programas de entrenamiento': 'landing.tierFeature.programs',
    'Check-in y progreso': 'landing.tierFeature.checkin',
    'Dashboard coach': 'landing.tierFeature.dashboard',
    'Branding personalizado': 'landing.tierFeature.branding',
    'Planes de nutrición': 'landing.tierFeature.nutritionPlans',
}

function translateTierFeature(feat: string, t: (k: string) => string) {
    const key = TIER_FEATURE_I18N_KEY[feat]
    return key ? t(key) : feat
}

const planDisplay: Array<{
    id: SubscriptionTier
    descKey: string
    icon: typeof Zap
    color: string
    bg: string
    border: string
    popular?: boolean
}> = [
    {
        id: 'starter_lite',
        descKey: 'landing.pricing.plan.starter_lite.desc',
        icon: Rocket,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/25',
    },
    {
        id: 'starter',
        descKey: 'landing.pricing.plan.starter.desc',
        icon: Zap,
        color: 'text-sky-600 dark:text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
    },
    {
        id: 'pro',
        descKey: 'landing.pricing.plan.pro.desc',
        icon: Crown,
        color: 'text-violet-600 dark:text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
        popular: true,
    },
    {
        id: 'elite',
        descKey: 'landing.pricing.plan.elite.desc',
        icon: Dumbbell,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
    },
    {
        id: 'scale',
        descKey: 'landing.pricing.plan.scale.desc',
        icon: Crown,
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/25',
    },
]

function PlanCard({ plan }: { plan: (typeof planDisplay)[0] }) {
    const { t, language } = useTranslation()
    const Icon = plan.icon
    const tier = TIER_CONFIG[plan.id]
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            className={cn(
                'relative flex flex-col rounded-2xl border bg-card p-5 sm:p-6 shadow-sm shadow-black/5 dark:shadow-black/20',
                plan.popular ? 'border-primary/40 ring-1 ring-primary/20 shadow-[0_0_32px_-8px_rgba(0,122,255,0.25)]' : 'border-border'
            )}
        >
            {plan.popular ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    {t('landing.pricing.popular')}
                </div>
            ) : null}

            <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl border', plan.bg, plan.border)}>
                <Icon className={cn('h-5 w-5', plan.color)} />
            </div>

            <h3 className="text-base font-bold text-foreground">{tier.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t(plan.descKey)}</p>
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                {TIER_STUDENT_RANGE_LABEL[plan.id]}
                {' · '}
                {language === 'es' ? `Hasta ${tier.maxClients} alumnos` : `Up to ${tier.maxClients} clients`}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {(() => {
                        const cycles = getTierAllowedBillingCycles(plan.id)
                        if (cycles.length === 1 && cycles[0] === 'monthly') return t('landing.pricing.billing.monthlyOnly')
                        return t('landing.pricing.billing.quarterlyAnnual')
                    })()}
                </span>
                <span
                    className={cn(
                        'rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
                        getTierCapabilities(plan.id).canUseNutrition
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    )}
                >
                    {getTierCapabilities(plan.id).canUseNutrition
                        ? t('landing.pricing.badge.nutritionYes')
                        : t('landing.pricing.badge.nutritionNo')}
                </span>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-border/60 pt-4">
                {cycleOrder
                    .filter((cycle) => getTierAllowedBillingCycles(plan.id).includes(cycle))
                    .map((cycle) => {
                        const cycleInfo = BILLING_CYCLE_CONFIG[cycle]
                        const price = getTierPriceClp(plan.id, cycle)
                        const cycleLabel =
                            cycle === 'monthly'
                                ? t('landing.billing.monthly')
                                : cycle === 'quarterly'
                                  ? t('landing.billing.quarterly')
                                  : t('landing.billing.annual')
                        return (
                            <div key={cycle} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5">
                                <span className="text-xs text-muted-foreground">
                                    {cycleLabel}
                                    {cycleInfo.discountPercent > 0 ? (
                                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">−{cycleInfo.discountPercent}%</span>
                                    ) : null}
                                </span>
                                <span className="text-xs font-semibold tabular-nums text-foreground">
                                    ${price.toLocaleString(locale)} CLP
                                </span>
                            </div>
                        )
                    })}
            </div>

            <ul className="mt-4 flex-1 space-y-2">
                {tier.features.slice(0, 5).map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{translateTierFeature(feat, t)}</span>
                    </li>
                ))}
                {tier.features.length > 5 ? (
                    <li className="text-[11px] text-muted-foreground/80">+{tier.features.length - 5}…</li>
                ) : null}
            </ul>

            <Link
                href={`/register?tier=${plan.id}&cycle=${getDefaultBillingCycleForTier(plan.id)}`}
                className={cn(
                    'mt-5 block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    plan.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border border-border bg-secondary/50 text-foreground hover:bg-secondary'
                )}
            >
                {t('landing.pricing.choosePlan')}
            </Link>
        </motion.div>
    )
}

export function LandingPricingPreview() {
    const { t } = useTranslation()

    const trainingOnly = planDisplay.filter((p) => ['starter_lite', 'starter'].includes(p.id))
    const withNutrition = planDisplay.filter((p) => ['pro', 'elite', 'scale'].includes(p.id))

    return (
        <section id="precios" className="relative scroll-mt-28 py-24 sm:py-28">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
            <div className="relative mx-auto max-w-6xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    className="mx-auto mb-12 max-w-2xl text-center"
                >
                    <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.nav.pricing')}
                    </span>
                    <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">{t('landing.pricing.title')}</h2>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">{t('landing.pricing.subtitle')}</p>
                    <Link
                        href="/pricing"
                        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                    >
                        {t('landing.pricing.fullLink')}
                        <span aria-hidden>→</span>
                    </Link>
                </motion.div>

                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('landing.pricing.groupTraining')}</span>
                    <span className="w-fit rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        {t('landing.pricing.groupTrainingBadge')}
                    </span>
                </div>
                <div className="mb-10 grid gap-4 sm:grid-cols-2">{trainingOnly.map((plan) => (
                    <PlanCard key={plan.id} plan={plan} />
                ))}</div>

                <div className="landing-divider mb-10" />

                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('landing.pricing.groupFull')}</span>
                    <span className="w-fit rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        {t('landing.pricing.groupFullBadge')}
                    </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{withNutrition.map((plan) => (
                    <PlanCard key={plan.id} plan={plan} />
                ))}</div>

                <p className="mt-10 text-center text-xs text-muted-foreground">
                    {t('landing.pricing.enterprise')}{' '}
                    <a href="mailto:contacto@eva-app.cl" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                        contacto@eva-app.cl
                    </a>
                </p>
            </div>
        </section>
    )
}
