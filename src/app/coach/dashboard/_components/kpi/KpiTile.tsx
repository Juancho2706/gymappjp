'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
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

function valueSizeClass(value: string): string {
    const len = value.length
    if (len <= 4) return 'text-4xl lg:text-5xl'
    if (len <= 6) return 'text-3xl lg:text-4xl'
    if (len <= 8) return 'text-2xl lg:text-3xl'
    if (len <= 10) return 'text-xl lg:text-2xl'
    if (len <= 12) return 'text-lg lg:text-xl'
    if (len <= 14) return 'text-base lg:text-lg'
    return 'text-sm lg:text-base'
}

export function KpiTile({ label, value, icon: Icon, deltaPct, hint, href, onClick }: Props) {
    const hasDelta = typeof deltaPct === 'number' && !Number.isNaN(deltaPct)
    const up = hasDelta && deltaPct! >= 0
    const interactive = !!href || !!onClick

    const valueClass = cn(
        'block max-w-full truncate font-display font-bold leading-none tracking-tight tabular-nums',
        valueSizeClass(value)
    )

    const inner = (
        <div className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
            </div>
            {hasDelta ? (
                <div className="flex flex-col items-start gap-1.5">
                    <span className={valueClass}>{value}</span>
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
                <span className={valueClass}>{value}</span>
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
