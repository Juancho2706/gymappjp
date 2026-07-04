'use client'

import Link from 'next/link'
import {
    type LucideIcon,
    CheckCircle2,
    ChevronRight,
    ArrowRight,
    CalendarX,
    OctagonAlert,
    Activity,
    CalendarClock,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { flagLabel, riskBand } from '../_lib/dashboard-design'
import type { RiskAlertItem } from '../_data/types'

interface Props {
    items: RiskAlertItem[]
    /** Mobile only: render the embedded "Tu próximo paso" inset (NextBestAction). */
    showNextStep?: boolean
    agendaPending?: number
    expiringOverdue?: number
    avgAdherence?: number
}

interface NextStep {
    Icon: LucideIcon
    title: string
    cta: string
    href: string
    tone: 'warn' | 'info' | 'positive'
}

/** Resolver de reglas (§2.7) verbatim de coach-dashboard-sheets.jsx NextBestAction. */
function resolveNextStep(
    riesgo: number,
    expiredCount: number,
    adherence: number,
    agendaPending: number
): NextStep {
    if (expiredCount > 0)
        return {
            Icon: CalendarX,
            title: `${expiredCount} ${expiredCount === 1 ? 'programa vencido' : 'programas vencidos'}`,
            cta: 'Revisar programas',
            href: '/coach/workout-programs',
            tone: 'warn',
        }
    if (riesgo >= 3)
        return {
            Icon: OctagonAlert,
            title: `${riesgo} alumnos en riesgo`,
            cta: 'Ver focus list',
            href: '/coach/clients?filter=risk',
            tone: 'warn',
        }
    if (adherence < 60)
        return {
            Icon: Activity,
            title: 'Adherencia promedio < 60%',
            cta: 'Ver detalle',
            href: '/coach/clients',
            tone: 'warn',
        }
    if (agendaPending > 0)
        return {
            Icon: CalendarClock,
            title: `${agendaPending} ${agendaPending === 1 ? 'pendiente' : 'pendientes'} hoy`,
            cta: 'Ver agenda',
            href: '/coach/clients',
            tone: 'info',
        }
    return {
        Icon: CheckCircle2,
        title: 'Todo bajo control',
        cta: 'Ver alumnos',
        href: '/coach/clients',
        tone: 'positive',
    }
}

const NEXT_STEP_ACC: Record<NextStep['tone'], string> = {
    warn: '#FFC861',
    info: '#7FB0FF',
    positive: '#4FD9A0',
}

/** NextBestAction embebido — variante flush/oscura dentro de la zona de prioridad. */
function NextStepInset({ step }: { step: NextStep }) {
    const acc = NEXT_STEP_ACC[step.tone]
    const { Icon } = step
    return (
        <Link
            href={step.href}
            className="flex w-full items-center gap-[11px] rounded-[10px] border border-[var(--border-inverse)] px-3 py-[11px] text-left"
            style={{ background: 'rgba(255,255,255,0.05)' }}
        >
            <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)', color: acc }}
            >
                <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div
                    className="text-[10px] font-extrabold uppercase tracking-[0.07em]"
                    style={{ color: acc }}
                >
                    Tu próximo paso
                </div>
                <div className="mt-px truncate text-[13.5px] font-bold text-[var(--text-on-dark)]">
                    {step.title}
                </div>
            </div>
            <span
                className="inline-flex shrink-0 items-center gap-[3px] text-xs font-extrabold"
                style={{ color: acc }}
            >
                {step.cta}
                <ArrowRight className="size-[13px]" />
            </span>
        </Link>
    )
}

/**
 * P2 + P6 — Zona de prioridad única ("Prioridad de hoy"). Always inverse (dark);
 * verbatim structure from coach-dashboard.jsx (eyebrow + count badge → headline →
 * named risk rows with risk band label+score → "Ver todos en Alumnos").
 * Reused 1:1 by the mobile stack and the desktop bento (it's the dark left card).
 */
export function PriorityCard({
    items,
    showNextStep = false,
    agendaPending = 0,
    expiringOverdue = 0,
    avgAdherence = 100,
}: Props) {
    const riesgoCount = items.length
    const nextStep = resolveNextStep(
        riesgoCount,
        expiringOverdue,
        avgAdherence,
        agendaPending
    )

    return (
        <div
            // Fondo por clase (no inline) para poder divergir por tema: en light sigue siendo la
            // hero card oscura (inverse-2 → inverse); en dark baja MÁS OSCURA que las cards vecinas
            // (mezcla card→app) para que el contenido interno resalte (feedback CEO 2026-07-04).
            className="rounded-card border border-[var(--border-inverse)] p-4 [background:linear-gradient(165deg,var(--surface-inverse-2)_0%,var(--surface-inverse)_100%)] dark:[background:linear-gradient(165deg,color-mix(in_srgb,var(--surface-card)_70%,var(--surface-app))_0%,var(--surface-app)_100%)]"
            style={{
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
                <div className="flex items-center gap-[11px] px-0 pb-2.5 pt-1">
                    <span
                        className="flex size-[38px] shrink-0 items-center justify-center rounded-full"
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
                                    className={`flex items-center gap-[11px] py-2.5 outline-none transition-colors hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] ${
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
                                            className="inline-flex items-center gap-[5px] whitespace-nowrap text-[11px] font-bold"
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
                                    <ChevronRight className="size-[17px] shrink-0 text-[var(--text-muted)]" />
                                </Link>
                            )
                        })}
                    </div>

                    {showNextStep && <NextStepInset step={nextStep} />}

                    <Link
                        href="/coach/clients?filter=risk"
                        className="mt-[9px] inline-flex h-9 w-full items-center justify-center gap-1 rounded-sm font-ui text-[13px] font-extrabold text-sport-400"
                    >
                        Ver todos en Alumnos <ArrowRight className="size-3.5" />
                    </Link>
                </>
            )}
        </div>
    )
}
