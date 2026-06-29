'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { flagLabel, riskBand } from '../_lib/dashboard-design'
import type { RiskAlertItem } from '../_data/types'

interface Props {
    items: RiskAlertItem[]
}

/**
 * P2 + P6 — Zona de prioridad única ("Prioridad de hoy"). Always inverse (dark);
 * verbatim structure from coach-dashboard.jsx (eyebrow + count badge → headline →
 * named risk rows with risk band label+score → "Ver todos en Alumnos").
 * Reused 1:1 by the mobile stack and the desktop bento (it's the dark left card).
 */
export function PriorityCard({ items }: Props) {
    const riesgoCount = items.length

    return (
        <div
            className="rounded-card border border-[var(--border-inverse)] p-4"
            style={{
                background:
                    'linear-gradient(165deg, var(--ink-900, #14181F) 0%, var(--ink-950, #0B0E13) 100%)',
                boxShadow:
                    '0 10px 30px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09)',
            }}
        >
            <div className="mb-3 flex items-center justify-between">
                <span className="whitespace-nowrap text-[11px] font-extrabold uppercase leading-[1.4] tracking-[0.08em] text-sport-400">
                    Prioridad de hoy
                </span>
                <span
                    className="rounded-pill px-2 py-0.5 text-[11px] font-extrabold text-[var(--ink-950)]"
                    style={{
                        background: riesgoCount
                            ? 'var(--danger-500)'
                            : 'var(--success-500)',
                    }}
                >
                    {riesgoCount}
                </span>
            </div>

            {riesgoCount === 0 ? (
                <div className="flex items-center gap-3 px-0 pb-2.5 pt-1">
                    <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full"
                        style={{ background: 'rgba(52,199,129,0.16)', color: '#4FD9A0' }}
                    >
                        <CheckCircle2 className="size-5" />
                    </span>
                    <div>
                        <div className="text-[15px] font-extrabold text-[var(--text-on-dark)]">
                            Ningún alumno en riesgo
                        </div>
                        <div className="text-[12.5px] text-[var(--text-on-dark-muted)]">
                            Todo al día. Buen trabajo.
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <h2 className="mb-3.5 font-display text-[20px] font-black leading-[1.12] tracking-[-0.02em] text-[var(--text-on-dark)]">
                        {riesgoCount}{' '}
                        {riesgoCount === 1 ? 'alumno necesita' : 'alumnos necesitan'} tu
                        atención
                    </h2>

                    <div className="mb-3 flex flex-col">
                        {items.map((s, i) => {
                            const band = riskBand(s.attentionScore)
                            return (
                                <Link
                                    key={s.clientId}
                                    href={`/coach/clients/${s.clientId}`}
                                    className={`flex items-center gap-3 py-2.5 outline-none transition-colors hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] ${
                                        i > 0 ? 'border-t border-[var(--border-inverse)]' : ''
                                    }`}
                                >
                                    <Avatar name={s.clientName} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-bold text-[var(--text-on-dark)]">
                                            {s.clientName}
                                        </div>
                                        <div className="text-xs text-[var(--text-on-dark-muted)]">
                                            {flagLabel(s.flags[0])}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                        <span
                                            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold"
                                            style={{ color: band.color }}
                                        >
                                            <span
                                                className="size-1.5 shrink-0 rounded-full"
                                                style={{ background: band.color }}
                                            />
                                            {band.label}
                                        </span>
                                        <span className="font-mono text-xs font-extrabold tabular-nums text-[var(--text-on-dark)]">
                                            {s.attentionScore}
                                            <span className="font-semibold text-[var(--text-on-dark-muted)]">
                                                /100
                                            </span>
                                        </span>
                                    </div>
                                    <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
                                </Link>
                            )
                        })}
                    </div>

                    <Link
                        href="/coach/clients?filter=risk"
                        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-control font-ui text-[13px] font-extrabold text-sport-400"
                    >
                        Ver todos en Alumnos <ArrowRight className="size-3.5" />
                    </Link>
                </>
            )}
        </div>
    )
}
