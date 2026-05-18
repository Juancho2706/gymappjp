'use client'

import Link from 'next/link'
import { Clock, ChevronRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import type { ExpiringProgramItem } from '../../_data/types'

export function ExpiringPrograms({ items }: { items: ExpiringProgramItem[] }) {
    return (
        <GlassCard className="h-full">
            <div className="flex flex-col gap-4 p-5">
                <header className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <h2 className="font-display text-lg font-bold tracking-tight">Programas por vencer</h2>
                </header>

                {items.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Sin programas vencidos ni por vencer.</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-border/50">
                        {items.map((p) => (
                            <li key={p.id}>
                                <Link
                                    href={p.clientId ? `/coach/clients/${p.clientId}` : '/coach/programs'}
                                    className="group flex items-center justify-between gap-3 py-2.5 -mx-2 px-2 rounded-lg transition-colors hover:bg-primary/5"
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <span className="truncate font-semibold">{p.clientName ?? 'Sin alumno'}</span>
                                        <span className="truncate text-xs text-muted-foreground">{p.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                                p.daysLeft <= 0
                                                    ? 'bg-rose-500/15 text-rose-500'
                                                    : 'bg-amber-500/15 text-amber-500'
                                            }`}
                                        >
                                            {p.daysLeft <= 0 ? 'Vencido' : `${p.daysLeft}d`}
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </GlassCard>
    )
}
