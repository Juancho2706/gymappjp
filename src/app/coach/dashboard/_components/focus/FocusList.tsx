'use client'

import Link from 'next/link'
import { TriangleAlert, ChevronRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { useArrowListNav } from '../../_hooks/useArrowListNav'
import type { RiskAlertItem } from '../../_data/types'

interface Props {
    items: RiskAlertItem[]
}

export function FocusList({ items }: Props) {
    const { containerRef, onKeyDown } = useArrowListNav<HTMLDivElement>()

    return (
        <GlassCard className="h-full" id="focus-list">
            <div className="flex flex-col gap-4 p-5">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TriangleAlert className="h-4 w-4 text-amber-500" />
                        <h2 className="font-display text-lg font-bold tracking-tight">Focus list</h2>
                    </div>
                    <Link
                        href="/coach/clients?filter=risk"
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
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
                        className="flex flex-col divide-y divide-border/50"
                    >
                        {items.map((c) => (
                            <Link
                                key={c.clientId}
                                href={`/coach/clients/${c.clientId}`}
                                role="listitem"
                                data-arrow-nav-item
                                className="group flex items-center justify-between gap-3 py-3 outline-none transition-colors focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg -mx-2 px-2"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate font-semibold">{c.clientName}</span>
                                    <span className="truncate text-xs text-muted-foreground">{c.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-500">
                                        {c.attentionScore}
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </GlassCard>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-2xl">✨</span>
            <p className="text-sm font-semibold">Sin alumnos en riesgo</p>
            <p className="text-xs text-muted-foreground">Todos con check-in y ejercicio al dia.</p>
        </div>
    )
}
