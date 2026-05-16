'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Crown, Dumbbell, Zap, Sprout, TrendingUp } from 'lucide-react'
import dynamic from 'next/dynamic'

const Player = dynamic(
    () => import('@lottiefiles/react-lottie-player').then((m) => m.Player),
    { ssr: false }
)
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
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const ALL_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'annual']

const MIN_TIER_FOR_CYCLE: Partial<Record<BillingCycle, SubscriptionTier>> = {
    annual: 'starter',
    quarterly: 'elite',
}


const SHARED_FEATURES_I18N_KEYS = [
    'landing.tierFeature.routinesUnlimited',
    'landing.tierFeature.catalogGif',
    'landing.tierFeature.programs',
    'landing.tierFeature.checkin',
    'landing.tierFeature.dashboard',
] as const

const planDisplay: Array<{
    id: SubscriptionTier
    descKey: string
    icon: typeof Zap
    color: string
    bg: string
    border: string
    topBorder: string
    popular?: boolean
    badge?: string
}> = [
    {
        id: 'free',
        descKey: 'landing.pricing.plan.free.desc',
        icon: Sprout,
        color: 'text-slate-500 dark:text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        topBorder: 'border-t-slate-400/60',
        badge: 'Gratis para siempre',
    },
    {
        id: 'starter',
        descKey: 'landing.pricing.plan.starter.desc',
        icon: Zap,
        color: 'text-sky-600 dark:text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        topBorder: 'border-t-sky-500/70 dark:border-t-sky-400/60',
    },
    {
        id: 'pro',
        descKey: 'landing.pricing.plan.pro.desc',
        icon: Crown,
        color: 'text-violet-600 dark:text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
        topBorder: 'border-t-primary/70 dark:border-t-primary/60',
        popular: true,
    },
    {
        id: 'elite',
        descKey: 'landing.pricing.plan.elite.desc',
        icon: Dumbbell,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        topBorder: 'border-t-amber-500/70 dark:border-t-amber-400/60',
    },
    {
        id: 'growth',
        descKey: 'landing.pricing.plan.growth.desc',
        icon: TrendingUp,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        topBorder: 'border-t-emerald-500/70 dark:border-t-emerald-400/60',
        badge: 'Nuevo',
    },
    {
        id: 'scale',
        descKey: 'landing.pricing.plan.scale.desc',
        icon: Crown,
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/25',
        topBorder: 'border-t-rose-500/70 dark:border-t-rose-400/60',
    },
]

const ALL_ORDER: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']

function planById(id: SubscriptionTier) {
    const p = planDisplay.find((x) => x.id === id)
    if (!p) throw new Error(`Unknown tier ${id}`)
    return p
}

// ─── Billing cycle tabs ────────────────────────────────────────────────────────

type BillingCycleTabsProps = {
    value: BillingCycle
    onChange: (cycle: BillingCycle) => void
}

function BillingCycleTabs({ value, onChange }: BillingCycleTabsProps) {
    const { t } = useTranslation()

    const labels: Record<BillingCycle, string> = {
        monthly: t('landing.billing.monthly'),
        quarterly: t('landing.billing.quarterly'),
        annual: t('landing.billing.annual'),
    }

    const discounts: Record<BillingCycle, number> = {
        monthly: 0,
        quarterly: BILLING_CYCLE_CONFIG.quarterly.discountPercent,
        annual: BILLING_CYCLE_CONFIG.annual.discountPercent,
    }

    return (
        <div
            role="group"
            aria-label={t('landing.pricing.toggle.aria')}
            className="inline-flex items-center gap-0.5 rounded-2xl border border-border bg-muted/60 p-1 backdrop-blur-sm"
        >
            {ALL_CYCLES.map((cycle) => {
                const active = value === cycle
                const discount = discounts[cycle]
                return (
                    <button
                        key={cycle}
                        type="button"
                        onClick={() => onChange(cycle)}
                        aria-pressed={active}
                        className={cn(
                            'relative rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId="billing-tab-bg"
                                className="absolute inset-0 rounded-xl bg-background shadow-sm"
                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            />
                        )}
                        <span className="relative flex items-center gap-1.5">
                            {labels[cycle]}
                            {discount > 0 && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none',
                                        active
                                            ? cycle === 'annual'
                                                ? 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-400'
                                                : 'bg-sky-500/20 text-sky-600 dark:bg-sky-400/20 dark:text-sky-400'
                                            : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    −{discount}%
                                </span>
                            )}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

// ─── Savings sparkle (Lottie one-shot) ───────────────────────────────────────

function SavingsSparkle({ play }: { play: boolean }) {
    if (!play) return null
    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <Player
                key="sparkle-playing"
                src="/lottie/savings-sparkle.json"
                autoplay
                loop={false}
                style={{ width: 240, height: 240, opacity: 0.75 }}
            />
        </div>
    )
}

// ─── Plan card (full — mobile carousel) ──────────────────────────────────────

type PlanCardProps = {
    plan: (typeof planDisplay)[0]
    billingCycle: BillingCycle
    suppressEntrance?: boolean
    inlinePopularBadge?: boolean
}

function PlanCard({ plan, billingCycle, suppressEntrance, inlinePopularBadge }: PlanCardProps) {
    const { t, language } = useTranslation()
    const Icon = plan.icon
    const tier = TIER_CONFIG[plan.id]
    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const allowed = getTierAllowedBillingCycles(plan.id)
    const isFree = plan.id === 'free'

    const effectiveCycle: BillingCycle = isFree
        ? 'monthly'
        : allowed.includes(billingCycle)
        ? billingCycle
        : 'monthly'

    const quarterlyFallback = !isFree && billingCycle === 'quarterly' && !allowed.includes('quarterly')
    const formatMoney = (n: number) => `$${n.toLocaleString(locale)}`

    const totalPrice = isFree ? 0 : getTierPriceClp(plan.id, effectiveCycle)
    const monthlyEquiv = isFree
        ? 0
        : effectiveCycle === 'monthly'
        ? totalPrice
        : Math.round(totalPrice / BILLING_CYCLE_CONFIG[effectiveCycle].months)

    const annualSavings =
        !isFree && effectiveCycle === 'annual'
            ? getTierPriceClp(plan.id, 'monthly') * 12 - totalPrice
            : 0

    const ctaHref = isFree
        ? '/register?tier=free'
        : `/register?tier=${plan.id}&cycle=${getDefaultBillingCycleForTier(plan.id)}`

    const visibleFeatures = tier.features.slice(0, 4)
    const hiddenCount = tier.features.length - visibleFeatures.length

    return (
        <motion.div
            initial={suppressEntrance ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            whileInView={suppressEntrance ? undefined : { opacity: 1, y: 0 }}
            viewport={suppressEntrance ? undefined : { once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            data-plan-card={plan.id}
            className={cn(
                'relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm shadow-black/5 dark:shadow-black/20',
                'border-t-[3px]',
                plan.topBorder,
                'border-border',
                plan.popular &&
                    'z-[1] border-primary/40 ring-2 ring-primary/20 shadow-[0_0_60px_-12px_rgba(0,122,255,0.45)]',
                plan.popular && inlinePopularBadge && 'pt-2'
            )}
        >
            {plan.popular && inlinePopularBadge && (
                <div className="-mt-2 mb-3 flex shrink-0 justify-center">
                    <span className="rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        {t('landing.pricing.popular')}
                    </span>
                </div>
            )}
            {plan.popular && !inlinePopularBadge && (
                <div className="absolute -top-3 left-1/2 z-[2] -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-md shadow-primary/30">
                    {t('landing.pricing.popular')}
                </div>
            )}
            {plan.badge && !plan.popular && (
                <div
                    className={cn(
                        'absolute -top-2.5 left-1/2 z-[2] -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        plan.badge === 'Nuevo' ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
                    )}
                >
                    {plan.badge}
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', plan.bg, plan.border)}>
                    <Icon className={cn('h-5 w-5', plan.color)} />
                </div>
                <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground">{tier.label}</h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{t(plan.descKey)}</p>
                </div>
            </div>

            <div className="mt-5 border-t border-border/50 pt-4">
                {isFree ? (
                    <>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-black tracking-tight text-foreground">$0</span>
                            <span className="text-sm text-muted-foreground">{t('landing.pricing.perMonth')}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{t('landing.pricing.freeAlways')}</p>
                    </>
                ) : (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={effectiveCycle}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black tracking-tight text-foreground tabular-nums">
                                    {formatMoney(monthlyEquiv)}
                                </span>
                                <span className="text-sm text-muted-foreground">{t('landing.pricing.perMonth')}</span>
                            </div>
                            {effectiveCycle !== 'monthly' && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {effectiveCycle === 'annual'
                                        ? t('landing.pricing.billedAnnually').replace('{{amount}}', formatMoney(totalPrice))
                                        : t('landing.pricing.billedQuarterly').replace('{{amount}}', formatMoney(totalPrice))}
                                </p>
                            )}
                            {annualSavings > 0 && (
                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                                    {t('landing.pricing.savings').replace('{{amount}}', formatMoney(annualSavings))}
                                </div>
                            )}
                            {quarterlyFallback && (
                                <p className="mt-1 text-[11px] italic text-muted-foreground/70">
                                    {t('landing.pricing.quarterlyFallback')}
                                </p>
                            )}
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {TIER_STUDENT_RANGE_LABEL[plan.id]}
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

            <ul className="mt-4 flex-1 space-y-2 border-t border-border/50 pt-4">
                {visibleFeatures.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="leading-snug">{feat}</span>
                    </li>
                ))}
                {hiddenCount > 0 && (
                    <li className="pl-5 text-xs text-muted-foreground/60">+ {hiddenCount} más</li>
                )}
            </ul>

            <Link
                href={ctaHref}
                className={cn(
                    'mt-5 block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isFree
                        ? 'border border-border bg-secondary/50 text-foreground hover:bg-secondary'
                        : plan.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border border-border bg-secondary/50 text-foreground hover:bg-secondary'
                )}
            >
                {isFree ? t('landing.pricing.startFree') : t('landing.pricing.choosePlan')}
            </Link>
        </motion.div>
    )
}

// ─── Plan card compact (desktop grid) ────────────────────────────────────────

type PlanCardCompactProps = {
    plan: (typeof planDisplay)[0]
    billingCycle: BillingCycle
}

function PlanCardCompact({ plan, billingCycle }: PlanCardCompactProps) {
    const { t, language } = useTranslation()
    const Icon = plan.icon
    const tier = TIER_CONFIG[plan.id]
    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const allowed = getTierAllowedBillingCycles(plan.id)
    const isFree = plan.id === 'free'

    const effectiveCycle: BillingCycle = isFree
        ? 'monthly'
        : allowed.includes(billingCycle)
        ? billingCycle
        : 'monthly'

    const quarterlyFallback = !isFree && billingCycle === 'quarterly' && !allowed.includes('quarterly')
    const formatMoney = (n: number) => `$${n.toLocaleString(locale)}`

    const totalPrice = isFree ? 0 : getTierPriceClp(plan.id, effectiveCycle)
    const monthlyEquiv = isFree
        ? 0
        : effectiveCycle === 'monthly'
        ? totalPrice
        : Math.round(totalPrice / BILLING_CYCLE_CONFIG[effectiveCycle].months)

    const annualSavings =
        !isFree && effectiveCycle === 'annual'
            ? getTierPriceClp(plan.id, 'monthly') * 12 - totalPrice
            : 0

    const ctaHref = isFree
        ? '/register?tier=free'
        : `/register?tier=${plan.id}&cycle=${getDefaultBillingCycleForTier(plan.id)}`

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ duration: 0.35 }}
            data-plan-card={plan.id}
            className={cn(
                'relative flex flex-col rounded-2xl border border-t-[2px] p-3.5',
                plan.topBorder,
                'border-border',
                plan.popular
                    ? 'bg-gradient-to-b from-primary/[0.07] to-transparent dark:from-primary/[0.14] ring-1 ring-primary/30 shadow-[0_0_40px_-8px_rgba(0,122,255,0.35)]'
                    : 'bg-card shadow-sm shadow-black/5 dark:shadow-black/20'
            )}
        >
            {/* Popular badge with Lottie crown */}
            {plan.popular && (
                <div className="absolute -top-3 left-1/2 z-[2] -translate-x-1/2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 shadow-md shadow-primary/30">
                    <Player
                        src="/lottie/crown.json"
                        autoplay
                        loop
                        style={{ width: 14, height: 14 }}
                    />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                        {t('landing.pricing.popular')}
                    </span>
                </div>
            )}

            {/* Non-popular badge */}
            {plan.badge && !plan.popular && (
                <div
                    className={cn(
                        'absolute -top-2.5 left-1/2 z-[2] -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                        plan.badge === 'Nuevo' ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
                    )}
                >
                    {plan.badge}
                </div>
            )}

            {/* Icon + name row */}
            <div className="flex items-center gap-2">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', plan.bg, plan.border)}>
                    <Icon className={cn('h-4 w-4', plan.color)} />
                </div>
                <h3 className="text-sm font-bold text-foreground leading-tight">{tier.label}</h3>
            </div>

            {/* Price */}
            <div className="mt-3">
                {isFree ? (
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-black tracking-tight text-foreground">$0</span>
                        <span className="text-xs text-muted-foreground ml-0.5">{t('landing.pricing.perMonth')}</span>
                    </div>
                ) : (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={effectiveCycle}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-2xl font-black tracking-tight text-foreground tabular-nums">
                                    {formatMoney(monthlyEquiv)}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">{t('landing.pricing.perMonth')}</span>
                            </div>
                            {effectiveCycle !== 'monthly' && (
                                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/70">
                                    {effectiveCycle === 'annual'
                                        ? t('landing.pricing.billedAnnually').replace('{{amount}}', formatMoney(totalPrice))
                                        : t('landing.pricing.billedQuarterly').replace('{{amount}}', formatMoney(totalPrice))}
                                </p>
                            )}
                            {quarterlyFallback && (
                                <p className="mt-0.5 text-[10px] italic text-muted-foreground/60">
                                    {t('landing.pricing.quarterlyFallback')}
                                </p>
                            )}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Savings pill — annual only */}
                <AnimatePresence>
                    {annualSavings > 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.85, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.85, y: 4 }}
                            transition={{ duration: 0.2 }}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                        >
                            <Check className="h-2.5 w-2.5 shrink-0" aria-hidden />
                            {t('landing.pricing.savings').replace('{{amount}}', formatMoney(annualSavings))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="my-2.5 h-px bg-border/50" />

            {/* Capacity + nutrition badges */}
            <div className="flex flex-wrap gap-1">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {TIER_STUDENT_RANGE_LABEL[plan.id]}
                </span>
                <span
                    className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                        getTierCapabilities(plan.id).canUseNutrition
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    )}
                >
                    {getTierCapabilities(plan.id).canUseNutrition ? '✓ Nutrición' : '✗ Nutrición'}
                </span>
            </div>

            {/* CTA */}
            <Link
                href={ctaHref}
                className={cn(
                    'mt-3 block w-full rounded-lg py-1.5 text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isFree
                        ? 'border border-border bg-secondary/50 text-foreground hover:bg-secondary'
                        : plan.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border border-border bg-secondary/50 text-foreground hover:bg-secondary'
                )}
            >
                {isFree ? t('landing.pricing.startFree') : t('landing.pricing.choosePlan')}
            </Link>
        </motion.div>
    )
}

// ─── Mobile carousel ──────────────────────────────────────────────────────────

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

type PricingMobileCarouselProps = {
    billingCycle: BillingCycle
    onBillingCycleChange: (cycle: BillingCycle) => void
    onCenteredTierChange: (tier: SubscriptionTier) => void
    scrollFnRef: React.MutableRefObject<((tier: SubscriptionTier) => void) | null>
}

function PricingMobileCarousel({
    billingCycle,
    onBillingCycleChange,
    onCenteredTierChange,
    scrollFnRef,
}: PricingMobileCarouselProps) {
    const { t } = useTranslation()
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [centeredTier, setCenteredTier] = useState<SubscriptionTier>('pro')
    const billingCycleRef = useRef(billingCycle)
    useEffect(() => { billingCycleRef.current = billingCycle }, [billingCycle])

    const isProgrammaticScrollRef = useRef(false)

    // Register scroll function so parent can drive carousel
    useLayoutEffect(() => {
        scrollFnRef.current = (tier) => {
            isProgrammaticScrollRef.current = true
            scrollPricingToTier(scrollerRef.current, tier, 'smooth')
            setTimeout(() => { isProgrammaticScrollRef.current = false }, 700)
        }
    }, [scrollFnRef])

    const findCenteredTier = useCallback((): SubscriptionTier => {
        const el = scrollerRef.current
        if (!el) return 'pro'
        const centerX = el.scrollLeft + el.clientWidth / 2
        let best: SubscriptionTier = ALL_ORDER[0]!
        let bestDist = Number.POSITIVE_INFINITY
        for (const id of ALL_ORDER) {
            const slide = el.querySelector<HTMLElement>(`[data-plan-slide="${id}"]`)
            if (!slide) continue
            const mid = slide.offsetLeft + slide.offsetWidth / 2
            const d = Math.abs(centerX - mid)
            if (d < bestDist) { bestDist = d; best = id }
        }
        return best
    }, [])

    // Layout sync only — no cycle check (used by ResizeObserver & initial mount)
    const syncCentered = useCallback(() => {
        const tier = findCenteredTier()
        setCenteredTier(tier)
        onCenteredTierChange(tier)
    }, [findCenteredTier, onCenteredTierChange])

    // User-initiated scroll — sync + possibly reset cycle
    const handleUserScroll = useCallback(() => {
        const tier = findCenteredTier()
        setCenteredTier(tier)
        onCenteredTierChange(tier)
        if (isProgrammaticScrollRef.current) return
        const cycle = billingCycleRef.current
        if (cycle !== 'monthly' && !getTierAllowedBillingCycles(tier).includes(cycle)) {
            onBillingCycleChange('monthly')
        }
    }, [findCenteredTier, onCenteredTierChange, onBillingCycleChange])

    useLayoutEffect(() => {
        scrollPricingToTier(scrollerRef.current, 'pro', 'auto')
        syncCentered()
    }, [syncCentered])

    useLayoutEffect(() => {
        const el = scrollerRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(syncCentered)
        ro.observe(el)
        return () => ro.disconnect()
    }, [syncCentered])

    return (
        <div className="lg:hidden" role="region" aria-label={t('landing.pricing.carouselAria')}>
            <div
                ref={scrollerRef}
                onScroll={handleUserScroll}
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
                        <PlanCard
                            plan={planById(id)}
                            billingCycle={billingCycle}
                            suppressEntrance
                            inlinePopularBadge={planById(id).popular}
                        />
                    </div>
                ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">
                <span className="inline sm:hidden" aria-hidden>←</span>
                {t('landing.pricing.swipeHint')}
                <span className="inline sm:hidden" aria-hidden>→</span>
            </p>
            <div
                className="mt-3 flex flex-wrap items-center justify-center gap-2"
                role="group"
                aria-label={t('landing.pricing.dotsAria')}
            >
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
                            onClick={() => scrollPricingToTier(scrollerRef.current, id, 'smooth')}
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active
                                    ? 'bg-primary ring-2 ring-primary/40'
                                    : 'bg-muted-foreground/25 hover:bg-muted-foreground/45'
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

// ─── Aurora backdrop ──────────────────────────────────────────────────────────

function PricingAuroraBackdrop() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-transparent to-muted/30 dark:from-background dark:via-background dark:to-muted/20" />
            <div className="absolute -left-[12%] top-[-18%] h-[135%] w-[32%] -rotate-[9deg] animate-[pulse_8s_ease-in-out_infinite] rounded-full bg-primary/[0.13] blur-[64px] dark:bg-primary/[0.28]" />
            <div className="absolute left-[8%] top-[-12%] h-[128%] w-[22%] -rotate-[5deg] rounded-full bg-primary/[0.09] blur-[56px] dark:bg-primary/[0.19]" />
            <div className="absolute left-[32%] top-[-22%] h-[142%] w-[26%] rotate-[4deg] rounded-full bg-primary/[0.12] blur-[72px] dark:bg-primary/[0.26]" />
            <div className="absolute left-[52%] top-[-14%] h-[130%] w-[20%] -rotate-[3deg] rounded-full bg-primary/[0.08] blur-[52px] dark:bg-primary/[0.17]" />
            <div className="absolute left-[68%] top-[-20%] h-[138%] w-[24%] rotate-[5deg] animate-[pulse_10s_ease-in-out_infinite_2s] rounded-full bg-primary/[0.11] blur-[60px] dark:bg-primary/[0.24]" />
            <div className="absolute -right-[8%] top-[-16%] h-[132%] w-[30%] rotate-[7deg] rounded-full bg-primary/[0.1] blur-[68px] dark:bg-primary/[0.22]" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/30 to-background/85 dark:from-background/50 dark:via-background/10 dark:to-background/85" />
        </div>
    )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LandingPricingPreview() {
    const { t } = useTranslation()
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
    const [sparkleKey, setSparkleKey] = useState(0)
    const [showSparkle, setShowSparkle] = useState(false)
    const [mobileCenteredTier, setMobileCenteredTier] = useState<SubscriptionTier>('pro')
    const carouselScrollFnRef = useRef<((tier: SubscriptionTier) => void) | null>(null)

    function handleCycleChange(cycle: BillingCycle) {
        setBillingCycle(cycle)
        if (cycle === 'annual') {
            setSparkleKey((k) => k + 1)
            setShowSparkle(true)
            setTimeout(() => setShowSparkle(false), 2500)
        } else {
            setShowSparkle(false)
        }
        // Auto-scroll mobile carousel to minimum tier that supports the new cycle
        if (cycle !== 'monthly') {
            const allowed = getTierAllowedBillingCycles(mobileCenteredTier)
            if (!allowed.includes(cycle)) {
                const minTier = MIN_TIER_FOR_CYCLE[cycle]
                if (minTier) carouselScrollFnRef.current?.(minTier)
            }
        }
    }

    return (
        <section id="precios" className="relative overflow-hidden scroll-mt-28 py-16 sm:py-20">
            <PricingAuroraBackdrop />
            <div className="relative mx-auto w-full max-w-[1400px] px-4 sm:px-6">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    className="mx-auto mb-6 max-w-3xl text-center"
                >
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.nav.pricing')}
                    </span>
                    <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
                        {t('landing.pricing.title')}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {t('landing.pricing.subtitle.new')}
                    </p>
                </motion.div>

                {/* Included features — compact inline banner */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.35 }}
                    className="mx-auto mb-5 max-w-4xl rounded-xl border border-border/50 bg-card/60 px-4 py-2.5 backdrop-blur-sm"
                >
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80 whitespace-nowrap">
                            {t('landing.pricing.includedEyebrow')}
                        </span>
                        {SHARED_FEATURES_I18N_KEYS.map((key) => (
                            <span key={key} className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                                <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                                {t(key)}
                            </span>
                        ))}
                    </div>
                </motion.div>

                {/* Billing cycle toggle — right above plans */}
                <div className="relative mb-6 flex justify-center">
                    <BillingCycleTabs value={billingCycle} onChange={handleCycleChange} />
                    <SavingsSparkle key={sparkleKey} play={showSparkle} />
                </div>

                {/* Mobile carousel */}
                <PricingMobileCarousel
                    billingCycle={billingCycle}
                    onBillingCycleChange={handleCycleChange}
                    onCenteredTierChange={setMobileCenteredTier}
                    scrollFnRef={carouselScrollFnRef}
                />

                {/* Desktop grid */}
                <div className="hidden lg:grid lg:grid-cols-3 xl:grid-cols-6 gap-3 overflow-y-visible pt-3">
                    <PlanCardCompact plan={planById('free')} billingCycle={billingCycle} />
                    <PlanCardCompact plan={planById('starter')} billingCycle={billingCycle} />
                    <PlanCardCompact plan={planById('pro')} billingCycle={billingCycle} />

                    {/* Row separator — visible in lg (3-col), hidden in xl (6-col) */}
                    <div className="col-span-3 xl:hidden flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-border/40" />
                        <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {t('landing.pricing.group.business')}
                        </span>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>

                    <PlanCardCompact plan={planById('elite')} billingCycle={billingCycle} />
                    <PlanCardCompact plan={planById('growth')} billingCycle={billingCycle} />
                    <PlanCardCompact plan={planById('scale')} billingCycle={billingCycle} />
                </div>

                {/* Enterprise */}
                <p className="mt-8 text-center text-xs text-muted-foreground">
                    {t('landing.pricing.enterprise')}{' '}
                    <a
                        href="mailto:contacto@eva-app.cl"
                        className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                        contacto@eva-app.cl
                    </a>
                </p>
            </div>
        </section>
    )
}
