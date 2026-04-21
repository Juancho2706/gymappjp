'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type SubscriptionTier,
} from '@/lib/constants'

const tierOrder: SubscriptionTier[] = ['starter_lite', 'starter', 'pro', 'elite', 'scale']

function TierPrices({ tier }: { tier: SubscriptionTier }) {
    const cycles = getTierAllowedBillingCycles(tier)
    return (
        <ul className="mt-3 space-y-1.5">
            {cycles.map((cycle) => {
                const info = BILLING_CYCLE_CONFIG[cycle]
                const price = getTierPriceClp(tier, cycle)
                return (
                    <li
                        key={cycle}
                        className="flex items-center justify-between gap-2 text-[11px] text-[var(--forge-muted)] sm:text-xs"
                    >
                        <span>
                            {info.label}
                            {info.discountPercent > 0 ? (
                                <span className="ml-1 text-[var(--forge-success)]">−{info.discountPercent}%</span>
                            ) : null}
                        </span>
                        <span className="forge-font-mono font-semibold tabular-nums text-[var(--forge-ink)]">
                            ${price.toLocaleString('es-CL')}
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}

export function ForgePricing() {
    const reduce = useReducedMotion()

    return (
        <section id="planes" className="w-full border-t border-[var(--forge-border)] bg-[var(--forge-surface-alt)]/50 py-16 backdrop-blur-[1px] md:py-24">
            <div className="mx-auto w-full max-w-7xl px-5 md:px-12 lg:px-20">
                <p className="forge-font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--forge-accent)]">Economía</p>
                <h2 className="forge-font-display mt-1 text-2xl font-black tracking-tight text-[var(--forge-ink)] sm:text-4xl">Planes en CLP</h2>
                <p className="mt-2 max-w-xl text-sm text-[var(--forge-ink-2)]">
                    Misma fuente de verdad que{' '}
                    <Link href="/pricing" className="text-[var(--forge-accent)] underline-offset-4 hover:underline">
                        /pricing
                    </Link>
                    . En móvil: deslizá horizontalmente.
                </p>

                <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-3 xl:grid-cols-5 [&::-webkit-scrollbar]:hidden">
                    {tierOrder.map((tier, i) => {
                        const cfg = TIER_CONFIG[tier]
                        const featured = tier === 'pro'
                        return (
                            <motion.article
                                key={tier}
                                initial={reduce ? false : { opacity: 0, y: 14 }}
                                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.04, duration: 0.45 }}
                                className={cn(
                                    'w-[min(100%,280px)] shrink-0 snap-center rounded-[12px] border p-5 sm:w-[min(100%,300px)] md:w-auto',
                                        featured
                                            ? 'forge-brutal-shadow border-[var(--forge-accent)] bg-[var(--forge-accent-bg)]'
                                            : 'border-[var(--forge-border)] bg-[var(--forge-surface)]'
                                )}
                            >
                                {featured ? (
                                    <span className="forge-font-mono inline-block rounded border border-[var(--forge-accent)]/50 bg-[var(--forge-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--forge-accent)]">
                                        recomendado
                                    </span>
                                ) : null}
                                <h3 className="forge-font-display mt-3 text-lg font-bold text-[var(--forge-ink)]">{cfg.label}</h3>
                                <p className="mt-1 text-xs text-[var(--forge-muted)]">{TIER_STUDENT_RANGE_LABEL[tier]}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    <span className="forge-font-mono rounded border border-[var(--forge-border)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--forge-muted)]">
                                        {getTierBillingCycleSummary(tier)}
                                    </span>
                                    <span
                                        className={cn(
                                            'forge-font-mono rounded border px-2 py-0.5 text-[9px] uppercase tracking-wide',
                                            getTierNutritionSummary(tier).startsWith('Sin')
                                                ? 'border-[var(--forge-warning)]/50 text-[var(--forge-warning)]'
                                                : 'border-[var(--forge-success)]/40 text-[var(--forge-success)]'
                                        )}
                                    >
                                        {getTierNutritionSummary(tier)}
                                    </span>
                                </div>
                                <TierPrices tier={tier} />
                                <p className="forge-font-mono mt-2 text-[10px] text-[var(--forge-dim)]">
                                    ref. ${cfg.monthlyPriceClp.toLocaleString('es-CL')} CLP/mes
                                </p>
                                <Link
                                    href={`/register?tier=${tier}&cycle=${getDefaultBillingCycleForTier(tier)}`}
                                    className={cn(
                                        'forge-font-mono mt-4 flex w-full items-center justify-center rounded-[10px] py-2.5 text-center text-xs font-bold uppercase',
                                        featured
                                            ? 'bg-[var(--forge-accent)] text-white hover:bg-[var(--forge-accent-dark)]'
                                            : 'border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] text-[var(--forge-ink)] hover:border-[var(--forge-accent)]/40'
                                    )}
                                >
                                    Elegir
                                </Link>
                            </motion.article>
                        )
                    })}
                </div>
                <p className="forge-font-mono mt-4 text-center text-[10px] uppercase tracking-widest text-[var(--forge-dim)] md:hidden">
                    ← swipe →
                </p>
            </div>
        </section>
    )
}
