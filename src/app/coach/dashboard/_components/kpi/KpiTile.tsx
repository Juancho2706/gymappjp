'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'

interface Props {
    label: string
    value: string
    icon: LucideIcon
    deltaPct?: number | null
    hint?: string
    href?: string
    onClick?: () => void
}

export function KpiTile({ label, value, icon: Icon, deltaPct, hint, href, onClick }: Props) {
    const hasDelta = typeof deltaPct === 'number' && !Number.isNaN(deltaPct)
    const up = hasDelta && deltaPct! >= 0
    const interactive = !!href || !!onClick

    const inner = (
        <div className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
            </div>
            {hasDelta ? (
                <div className="flex flex-col items-start gap-1.5">
                    <span className="max-w-full font-display text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-3xl lg:text-4xl">
                        {value}
                    </span>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            up
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-rose-500/15 text-rose-500'
                        }`}
                    >
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(deltaPct!)}%
                    </span>
                </div>
            ) : (
                <span className="font-display text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-3xl lg:text-4xl">
                    {value}
                </span>
            )}
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            {interactive && (
                <span className="mt-auto text-xs font-semibold" style={{ color: 'var(--theme-primary, #007AFF)' }}>
                    Ver detalle →
                </span>
            )}
        </div>
    )

    return (
        <motion.div
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="h-full"
        >
            <GlassCard hoverEffect={interactive} className="h-full">
                {href ? (
                    <Link href={href} className="block h-full w-full">
                        {inner}
                    </Link>
                ) : onClick ? (
                    <button type="button" onClick={onClick} className="block h-full w-full text-left">
                        {inner}
                    </button>
                ) : (
                    inner
                )}
            </GlassCard>
        </motion.div>
    )
}
