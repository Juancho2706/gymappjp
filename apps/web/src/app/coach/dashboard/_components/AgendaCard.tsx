'use client'

import Link from 'next/link'
import { type LucideIcon, CalendarClock, ClipboardCheck, Dumbbell, Calendar, ChevronRight, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SectionTitle } from './SectionTitle'
import type { AgendaItem } from '../_data/types'
import type { AgendaSeverity } from '@eva/profile-analytics'

const KIND_ICON: Record<AgendaItem['kind'], LucideIcon> = {
    programa_vence: CalendarClock,
    checkin_pendiente: ClipboardCheck,
    sin_ejercicio: Dumbbell,
}

/** Punto de urgencia de la fila. La severidad la decide el servidor (`agendaSeverity`/`programSeverity`). */
const SEVERITY_COLOR: Record<AgendaSeverity, string> = {
    danger: 'var(--danger-500)',
    warning: 'var(--warning-500)',
    none: 'var(--muted-foreground)',
}

/**
 * «Pendientes de hoy» — trabajo derivado del día: alumnos sin entrenos, sin check-in o con programa
 * por vencer. No es una agenda con horario (no existe tabla de agendamiento) ni tiene estado
 * «hecha», así que se retiraron la hora de relleno y el «0 de N hechas» que las fingían.
 *
 * `total` son los pendientes REALES (antes del tope de 8) y es lo que cuenta el header; cuando hay
 * más de los que caben, la última fila manda al directorio. El `label` de cada fila llega armado
 * del servidor: este componente es cliente y no formatea fechas (sin `Intl`, EVA-NEXTJS-18).
 */
export function AgendaCard({ items, total }: { items: AgendaItem[]; total: number }) {
    const extra = total - items.length
    return (
        <div>
            <SectionTitle action={`${total} ${total === 1 ? 'pendiente' : 'pendientes'}`}>
                Pendientes de hoy
            </SectionTitle>
            <Card padding="none" className="gap-0 overflow-hidden">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <CheckCircle2 className="size-6 text-[var(--success-500)]" />
                        <p className="text-sm font-bold text-[var(--text-strong)]">Todo al día</p>
                        <p className="text-xs text-[var(--text-muted)]">Sin pendientes hoy.</p>
                    </div>
                ) : (
                    <>
                        {items.map((a, i) => {
                            const Icon = KIND_ICON[a.kind] ?? Calendar
                            return (
                                <div key={a.id}>
                                    {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                    <Link
                                        href={a.href}
                                        className="flex cursor-pointer items-center gap-3 px-3.5 py-[11px] transition-colors hover:bg-surface-sunken"
                                    >
                                        <span
                                            aria-hidden
                                            className="size-2 shrink-0 rounded-full"
                                            style={{ background: SEVERITY_COLOR[a.severity] }}
                                        />
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
                        })}
                        {extra > 0 && (
                            <div>
                                <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />
                                <Link
                                    href="/coach/clients"
                                    className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-[11px] text-[12.5px] font-bold text-sport-700 transition-colors hover:bg-surface-sunken"
                                >
                                    y {extra} más en Alumnos
                                    <ChevronRight className="size-[18px] shrink-0 text-[var(--ink-300)]" />
                                </Link>
                            </div>
                        )}
                    </>
                )}
            </Card>
        </div>
    )
}
