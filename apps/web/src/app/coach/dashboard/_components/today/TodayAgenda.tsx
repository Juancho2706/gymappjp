'use client'

import Link from 'next/link'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ListRow } from '@/components/ui/list-row'
import type { AgendaItem } from '../../_data/types'

const KIND_ICON = {
    programa_vence: '⏳',
    checkin_pendiente: '📷',
    sin_ejercicio: '💪',
} as const

export function TodayAgenda({ items }: { items: AgendaItem[] }) {
    return (
        <Card id="agenda" padding="none" className="h-full">
            <header className="flex items-center justify-between px-4 pb-1 pt-4">
                <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-sport-500" />
                    <h2 className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-strong)]">
                        Agenda de hoy
                    </h2>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{items.length} pendientes</span>
            </header>

            {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <CheckCircle2 className="size-6 text-[var(--success-500)]" />
                    <p className="text-sm font-bold text-[var(--text-strong)]">Todo cerrado</p>
                    <p className="text-xs text-[var(--text-muted)]">Sin pendientes en el dia.</p>
                </div>
            ) : (
                <div className="flex flex-col px-2 pb-2">
                    {items.map((it, i) => (
                        <Link
                            key={it.id}
                            href={it.href}
                            className={cn(
                                'block rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                i > 0 && 'border-t border-border-subtle'
                            )}
                        >
                            <ListRow
                                className="cursor-pointer rounded-none hover:bg-surface-sunken"
                                leading={
                                    <span className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-base">
                                        {KIND_ICON[it.kind]}
                                    </span>
                                }
                                title={it.clientName}
                                subtitle={it.label}
                                showChevron
                            />
                        </Link>
                    ))}
                </div>
            )}
        </Card>
    )
}
