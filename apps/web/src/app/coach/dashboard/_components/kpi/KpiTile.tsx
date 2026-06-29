'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    if (len <= 4) return 'text-[32px] lg:text-4xl'
    if (len <= 6) return 'text-[28px] lg:text-[34px]'
    if (len <= 8) return 'text-2xl lg:text-3xl'
    if (len <= 10) return 'text-xl lg:text-2xl'
    if (len <= 12) return 'text-lg lg:text-xl'
    if (len <= 14) return 'text-base lg:text-lg'
    return 'text-sm lg:text-base'
}

/**
 * KPI tile — EVA DS StatCard idiom (uppercase eyebrow, big tabular black metric,
 * signed-delta pill, hint) wrapped in an interactive Link/button affordance.
 */
export function KpiTile({ label, value, icon: Icon, deltaPct, hint, href, onClick }: Props) {
    const hasDelta = typeof deltaPct === 'number' && !Number.isNaN(deltaPct)
    const up = hasDelta && deltaPct! >= 0
    const interactive = !!href || !!onClick

    const valueClass = cn(
        'block max-w-full truncate font-display font-black leading-none tracking-[-0.03em] tabular-nums text-[var(--text-strong)]',
        valueSizeClass(value)
    )

    const inner = (
        <div className="flex h-full flex-col gap-2 p-4 lg:p-5">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                <Icon className="size-[18px] text-sport-500" />
            </div>
            <span className={valueClass}>{value}</span>
            {hasDelta && (
                <span
                    className={cn(
                        'inline-flex w-fit shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-bold',
                        up
                            ? 'bg-[var(--success-100)] text-[var(--success-600)]'
                            : 'bg-[var(--danger-100)] text-[var(--danger-600)]'
                    )}
                >
                    <span aria-hidden className="text-[11px] leading-none">{up ? '▲' : '▼'}</span>
                    {Math.abs(deltaPct!)}%
                </span>
            )}
            {hint && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
            {interactive && (
                <span className="mt-auto pt-1 text-xs font-bold text-sport-500">Ver detalle →</span>
            )}
        </div>
    )

    const surface = cn(
        'h-full rounded-card border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)] [transition:transform_var(--dur-fast)_var(--ease-out),box-shadow_var(--dur-fast)_var(--ease-out)]',
        interactive && 'cursor-pointer hover:-translate-y-px hover:shadow-[var(--shadow-md)]'
    )

    if (href) {
        return (
            <Link href={href} className={cn(surface, 'block')}>
                {inner}
            </Link>
        )
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={cn(surface, 'block w-full text-left')}>
                {inner}
            </button>
        )
    }
    return <div className={surface}>{inner}</div>
}
