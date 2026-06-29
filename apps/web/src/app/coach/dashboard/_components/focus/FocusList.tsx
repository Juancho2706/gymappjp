'use client'

import Link from 'next/link'
import { TriangleAlert, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { useArrowListNav } from '../../_hooks/useArrowListNav'
import type { RiskAlertItem } from '../../_data/types'

interface Props {
    items: RiskAlertItem[]
}

/** Risk band label + accent (fixed on-dark colors — the priority card is always dark). */
function riskBand(score: number): { label: string; color: string } {
    if (score >= 80) return { label: 'Riesgo alto', color: '#FF7C97' }
    if (score >= 50) return { label: 'Riesgo medio', color: '#FFC861' }
    return { label: 'Seguimiento', color: 'var(--text-on-dark-muted)' }
}

export function FocusList({ items }: Props) {
    const { containerRef, onKeyDown } = useArrowListNav<HTMLDivElement>()

    return (
        <Card id="focus-list" variant="inverse" padding="lg" className="h-full">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-[var(--warning-500)]" />
                    <h2 className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-on-dark)]">
                        Focus list
                    </h2>
                </div>
                <Link
                    href="/coach/clients?filter=risk"
                    className="text-xs font-bold uppercase tracking-wider text-[var(--text-on-dark-muted)] transition-colors hover:text-[var(--text-on-dark)]"
                >
                    Ver todos
                </Link>
            </header>

            {items.length === 0 ? (
                <EmptyState />
            ) : (
                <div
                    ref={containerRef}
                    onKeyDown={onKeyDown}
                    role="list"
                    className="flex flex-col"
                >
                    {items.map((c, i) => {
                        const band = riskBand(c.attentionScore)
                        return (
                            <Link
                                key={c.clientId}
                                href={`/coach/clients/${c.clientId}`}
                                role="listitem"
                                data-arrow-nav-item
                                className={cn(
                                    'group flex items-center gap-3 rounded-control py-2.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                    i > 0 && 'border-t border-[var(--border-inverse)]'
                                )}
                            >
                                <Avatar name={c.clientName} size="sm" />
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-bold text-[var(--text-on-dark)]">
                                        {c.clientName}
                                    </span>
                                    <span className="truncate text-xs text-[var(--text-on-dark-muted)]">
                                        {c.label}
                                    </span>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-0.5">
                                    <span
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold"
                                        style={{ color: band.color }}
                                    >
                                        <span className="size-1.5 rounded-full" style={{ background: band.color }} />
                                        {band.label}
                                    </span>
                                    <span className="font-mono text-xs font-extrabold tabular-nums text-[var(--text-on-dark)]">
                                        {c.attentionScore}
                                        <span className="font-semibold text-[var(--text-on-dark-muted)]">/100</span>
                                    </span>
                                </div>
                                <ChevronRight className="size-4 shrink-0 text-[var(--text-on-dark-muted)] transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        )
                    })}
                </div>
            )}
        </Card>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-2xl">✨</span>
            <p className="text-sm font-bold text-[var(--text-on-dark)]">Sin alumnos en riesgo</p>
            <p className="text-xs text-[var(--text-on-dark-muted)]">Todos con check-in y ejercicio al dia.</p>
        </div>
    )
}
