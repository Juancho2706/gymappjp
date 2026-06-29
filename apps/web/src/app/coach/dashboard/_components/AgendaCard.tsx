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

/** Placeholder clock-time per row (09:00, 10:30, 12:00…). La agenda real es trabajo
 * pendiente derivado (sin hora agendada); la hora se rellena para igualar el diseño. */
function slotTime(i: number): string {
    const start = 9 * 60 // 09:00
    const mins = start + i * 90
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * "Agenda de hoy" — tareas pendientes del día. Estructura verbatim de
 * coach-dashboard.jsx: hora (mono) + icono + quién + qué + estado (check si hecho /
 * chevron si pendiente), con "{hechas} de {total} hechas" en el SectionTitle. La
 * pipeline real no expone hora ni flag `done`, así que se rellenan (placeholder).
 */
export function AgendaCard({ items }: { items: AgendaItem[] }) {
    const done = 0
    return (
        <div>
            <SectionTitle action={`${done} de ${items.length} hechas`}>
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
                                    className="flex cursor-pointer items-center gap-3 px-3.5 py-[11px] transition-colors hover:bg-surface-sunken"
                                >
                                    <span className="w-[42px] shrink-0 font-mono text-xs font-bold tabular-nums text-[var(--text-muted)]">
                                        {slotTime(i)}
                                    </span>
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[var(--ink-700)]">
                                        <Icon className="size-[15px]" />
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
