'use client'

import Link from 'next/link'
import { type LucideIcon, CalendarClock, ClipboardCheck, Dumbbell, Calendar, ChevronRight, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SectionTitle } from './SectionTitle'
import type { AgendaItem } from '../_data/types'

const KIND_ICON: Record<AgendaItem['kind'], LucideIcon> = {
    programa_vence: CalendarClock,
    checkin_pendiente: ClipboardCheck,
    sin_ejercicio: Dumbbell,
}

/**
 * "Agenda de hoy" — today's pending tasks. Structure from coach-dashboard.jsx
 * (time + icon + who + what + status). The real agenda is derived pending work
 * (no scheduled clock-time / done flag), so we render kind-icon + name + label +
 * chevron and surface the pending count in the section action.
 */
export function AgendaCard({ items }: { items: AgendaItem[] }) {
    return (
        <div>
            <SectionTitle action={`${items.length} pendiente${items.length === 1 ? '' : 's'}`}>
                Agenda de hoy
            </SectionTitle>
            <Card padding="none" className="gap-0 overflow-hidden">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <CheckCircle2 className="size-6 text-[var(--success-500)]" />
                        <p className="text-sm font-bold text-[var(--text-strong)]">Todo cerrado</p>
                        <p className="text-xs text-[var(--text-muted)]">Sin pendientes en el día.</p>
                    </div>
                ) : (
                    items.map((a, i) => {
                        const Icon = KIND_ICON[a.kind] ?? Calendar
                        return (
                            <div key={a.id}>
                                {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                <Link
                                    href={a.href}
                                    className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-sunken"
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[var(--ink-700)]">
                                        <Icon className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-bold text-[var(--text-strong)]">
                                            {a.clientName}
                                        </div>
                                        <div className="truncate text-[12.5px] text-[var(--text-muted)]">
                                            {a.label}
                                        </div>
                                    </div>
                                    <ChevronRight className="size-[18px] shrink-0 text-[var(--ink-300)]" />
                                </Link>
                            </div>
                        )
                    })
                )}
            </Card>
        </div>
    )
}
