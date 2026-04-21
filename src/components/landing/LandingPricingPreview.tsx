'use client'

import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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

const ALL_ORDER: SubscriptionTier[] = ['starter_lite', 'starter', 'pro', 'elite', 'scale']

function planById(id: SubscriptionTier) {
    const p = planDisplay.find((x) => x.id === id)
    if (!p) throw new Error(`Unknown tier ${id}`)
    return p
}

function isMonthlyTier(id: SubscriptionTier) {
    const c = getTierAllowedBillingCycles(id)
    return c.length === 1 && c[0] === 'monthly'
}

type PlanCardProps = {
    plan: (typeof planDisplay)[0]
    /** Carrusel móvil: evita animación whileInView en cada tarjeta */
    suppressEntrance?: boolean
    /** Badge “Más popular” dentro del flujo (evita recorte por overflow-x del carrusel) */
    inlinePopularBadge?: boolean
}

function PlanCard({ plan, suppressEntrance, inlinePopularBadge }: PlanCardProps) {
    const { t, language } = useTranslation()
    const Icon = plan.icon
    const tier = TIER_CONFIG[plan.id]
    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const allowed = getTierAllowedBillingCycles(plan.id)
    const monthlyCycles = cycleOrder.filter((c) => c === 'monthly' && allowed.includes(c))
    const prepaidCycles = cycleOrder.filter((c) => c !== 'monthly' && allowed.includes(c))
    const monthlyTier = isMonthlyTier(plan.id)

    const formatMoney = (n: number) => `$${n.toLocaleString(locale)}`

    return (
        <motion.div
            initial={suppressEntrance ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            whileInView={suppressEntrance ? undefined : { opacity: 1, y: 0 }}
            viewport={suppressEntrance ? undefined : { once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            data-plan-card={plan.id}
            className={cn(
                'relative flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm shadow-black/5 dark:shadow-black/20 sm:p-5',
                monthlyTier
                    ? 'border-t-[3px] border-t-sky-500/70 border-border dark:border-t-sky-400/60'
                    : 'border-t-[3px] border-t-violet-500/70 border-border dark:border-t-violet-400/60',
                plan.popular &&
                    'z-[1] border-primary/45 ring-2 ring-primary/25 shadow-[0_0_40px_-12px_rgba(0,122,255,0.35)] lg:scale-[1.03]',
                plan.popular && inlinePopularBadge && 'pt-1'
            )}
        >
            {plan.popular && inlinePopularBadge ? (
                <div className="-mt-1 mb-2 flex shrink-0 justify-center">
                    <span className="rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        {t('landing.pricing.popular')}
                    </span>
                </div>
            ) : null}
            {plan.popular && !inlinePopularBadge ? (
                <div className="absolute -top-2.5 left-1/2 z-[2] -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    {t('landing.pricing.popular')}
                </div>
            ) : null}

            <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl border', plan.bg, plan.border)}>
                <Icon className={cn('h-5 w-5', plan.color)} />
            </div>

            <h3 className="text-base font-bold text-foreground">{tier.label}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(plan.descKey)}</p>
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

            <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                {monthlyCycles.length > 0 ? (
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-2.5 dark:border-sky-500/25 dark:bg-sky-500/10">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                            {t('landing.pricing.priceBlock.monthly')}
                        </p>
                        <div className="space-y-1.5">
                            {monthlyCycles.map((cycle) => {
                                const cycleInfo = BILLING_CYCLE_CONFIG[cycle]
                                const price = getTierPriceClp(plan.id, cycle)
                                const cycleLabel = t('landing.billing.monthly')
                                return (
                                    <div
                                        key={cycle}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5"
                                    >
                                        <span className="text-xs text-muted-foreground">
                                            {cycleLabel}
                                            {cycleInfo.discountPercent > 0 ? (
                                                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                                                    −{cycleInfo.discountPercent}%
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="text-xs font-semibold tabular-nums text-foreground">{formatMoney(price)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : null}

                {prepaidCycles.length > 0 ? (
                    <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] p-2.5 dark:bg-violet-500/10">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-200">
                            {t('landing.pricing.priceBlock.prepaid')}
                        </p>
                        <div className="space-y-1.5">
                            {prepaidCycles.map((cycle) => {
                                const cycleInfo = BILLING_CYCLE_CONFIG[cycle]
                                const price = getTierPriceClp(plan.id, cycle)
                                const cycleLabel =
                                    cycle === 'quarterly' ? t('landing.billing.quarterly') : t('landing.billing.annual')
                                return (
                                    <div
                                        key={cycle}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5"
                                    >
                                        <span className="text-xs text-muted-foreground">
                                            {cycleLabel}
                                            {cycleInfo.discountPercent > 0 ? (
                                                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                                                    −{cycleInfo.discountPercent}%
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="text-xs font-semibold tabular-nums text-foreground">{formatMoney(price)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : null}
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

function scrollPricingToTier(
    container: HTMLDivElement | null,
    tierId: SubscriptionTier,
    behavior: ScrollBehavior = 'auto'
) {
    if (!container) return
    const slide = container.querySelector<HTMLElement>(`[data-plan-slide="${tierId}"]`)
    if (!slide) return
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
    const target = slideCenter - container.clientWidth / 2
    container.scrollTo({ left: Math.max(0, target), behavior })
}

function PricingMobileCarousel() {
    const { t } = useTranslation()
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [centeredTier, setCenteredTier] = useState<SubscriptionTier>('pro')

    const updateCenteredFromScroll = useCallback(() => {
        const el = scrollerRef.current
        if (!el) return
        const centerX = el.scrollLeft + el.clientWidth / 2
        let best: SubscriptionTier = ALL_ORDER[0]!
        let bestDist = Number.POSITIVE_INFINITY
        for (const id of ALL_ORDER) {
            const slide = el.querySelector<HTMLElement>(`[data-plan-slide="${id}"]`)
            if (!slide) continue
            const mid = slide.offsetLeft + slide.offsetWidth / 2
            const d = Math.abs(centerX - mid)
            if (d < bestDist) {
                bestDist = d
                best = id
            }
        }
        setCenteredTier(best)
    }, [])

    useLayoutEffect(() => {
        scrollPricingToTier(scrollerRef.current, 'pro', 'auto')
        updateCenteredFromScroll()
    }, [updateCenteredFromScroll])

    useLayoutEffect(() => {
        const el = scrollerRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(() => {
            updateCenteredFromScroll()
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [updateCenteredFromScroll])

    const focusTier = (id: SubscriptionTier) => {
        scrollPricingToTier(scrollerRef.current, id, 'smooth')
    }

    return (
        <div className="lg:hidden" role="region" aria-label={t('landing.pricing.carouselAria')}>
            <div
                ref={scrollerRef}
                onScroll={updateCenteredFromScroll}
                className={cn(
                    'flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible overscroll-x-contain scroll-smooth pb-2 pt-4',
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    'scroll-ps-4 scroll-pe-4 ps-2 pe-2 [scroll-padding-inline:0.75rem]'
                )}
            >
                {ALL_ORDER.map((id) => (
                    <div
                        key={id}
                        data-plan-slide={id}
                        className="w-[min(22rem,calc(100vw-2.5rem))] shrink-0 snap-center pt-1"
                    >
                        <PlanCard plan={planById(id)} suppressEntrance inlinePopularBadge={planById(id).popular} />
                    </div>
                ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">
                <span className="inline sm:hidden" aria-hidden>
                    ←
                </span>
                {t('landing.pricing.swipeHint')}
                <span className="inline sm:hidden" aria-hidden>
                    →
                </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2" role="group" aria-label={t('landing.pricing.dotsAria')}>
                {ALL_ORDER.map((id) => {
                    const label = TIER_CONFIG[id].label
                    const dotLabel = t('landing.pricing.planDotLabel').replace('{{plan}}', label)
                    const active = centeredTier === id
                    return (
                        <button
                            key={id}
                            type="button"
                            aria-label={dotLabel}
                            aria-pressed={active}
                            onClick={() => focusTier(id)}
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active ? 'bg-primary ring-2 ring-primary/40' : 'bg-muted-foreground/25 hover:bg-muted-foreground/45'
                            )}
                        >
                            <span className="sr-only">{label}</span>
                            <span
                                className={cn('block h-2 w-2 rounded-full', active ? 'bg-primary-foreground' : 'bg-background')}
                                aria-hidden
                            />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function LandingPricingPreview() {
    const { t } = useTranslation()

    return (
        <section id="precios" className="relative scroll-mt-28 py-20 sm:py-24">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
            <div className="relative mx-auto w-full max-w-[1600px] px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    className="mx-auto mb-8 max-w-3xl text-center md:mb-10"
                >
                    <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.nav.pricing')}
                    </span>
                    <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">{t('landing.pricing.title')}</h2>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">{t('landing.pricing.subtitle')}</p>
                </motion.div>

                <div className="mb-6 flex flex-col gap-3 text-center sm:flex-row sm:flex-wrap sm:justify-center sm:gap-6 sm:text-left">
                    <div className="flex items-center justify-center gap-2 sm:justify-start">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('landing.pricing.legendMonthly')}
                        </span>
                    </div>
                    <div className="flex items-center justify-center gap-2 sm:justify-start">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('landing.pricing.legendPrepaid')}
                        </span>
                    </div>
                </div>

                <PricingMobileCarousel />

                <div className="hidden gap-3 overflow-x-clip overflow-y-visible py-2 lg:grid lg:grid-cols-5 xl:gap-4">
                    {ALL_ORDER.map((id) => (
                        <PlanCard key={id} plan={planById(id)} />
                    ))}
                </div>

                <p className="mt-6 text-center text-[11px] text-muted-foreground/90">{t('landing.pricing.currencyNote')}</p>

                <p className="mt-8 text-center text-xs text-muted-foreground md:mt-10">
                    {t('landing.pricing.enterprise')}{' '}
                    <a href="mailto:contacto@eva-app.cl" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                        contacto@eva-app.cl
                    </a>
                </p>
            </div>
        </section>
    )
}
