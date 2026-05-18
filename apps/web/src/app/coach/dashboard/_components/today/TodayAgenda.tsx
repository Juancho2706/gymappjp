'use client'

import Link from 'next/link'
import { CalendarClock, ChevronRight, CheckCircle2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import type { AgendaItem } from '../../_data/types'

const KIND_ICON = {
    programa_vence: '⏳',
    checkin_pendiente: '📷',
    sin_ejercicio: '💪',
} as const

export function TodayAgenda({ items }: { items: AgendaItem[] }) {
    return (
        <GlassCard className="h-full" id="agenda">
            <div className="flex flex-col gap-4 p-5">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
                        <h2 className="font-display text-lg font-bold tracking-tight">Agenda de hoy</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">{items.length} pendientes</span>
                </header>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        <p className="text-sm font-semibold">Todo cerrado</p>
                        <p className="text-xs text-muted-foreground">Sin pendientes en el dia.</p>
                    </div>
                ) : (
                    <ul className="flex flex-col divide-y divide-border/50">
                        {items.map((it) => (
                            <li key={it.id}>
                                <Link
                                    href={it.href}
                                    className="group flex items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-lg transition-colors hover:bg-primary/5"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span aria-hidden className="text-lg">{KIND_ICON[it.kind]}</span>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-semibold">{it.clientName}</span>
                                            <span className="truncate text-xs text-muted-foreground">{it.label}</span>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </GlassCard>
    )
}
