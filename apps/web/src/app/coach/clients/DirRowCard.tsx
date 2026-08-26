'use client'

import { useRouter } from 'next/navigation'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { differenceInDays } from 'date-fns'
import { AlertOctagon, AlertTriangle, Check, Apple, MoreVertical } from 'lucide-react'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'
import { DemoClientBadge } from './DemoClientBadge'
import { clientStatusInputFromRow, getClientStatusMeta } from './_lib/client-status'

// ===== severidad / estado helpers (espejo del diseño coach-directory.jsx) =====
function severityMeta(score: number) {
    if (score >= 50)
        return {
            label: 'Riesgo',
            cls: 'bg-[var(--danger-100)] text-[var(--danger-700)]',
            Icon: AlertOctagon,
        }
    if (score >= 25)
        return {
            label: 'Atención',
            cls: 'bg-[var(--warning-100)] text-[var(--warning-700)]',
            Icon: AlertTriangle,
        }
    return {
        label: 'On track',
        cls: 'bg-[var(--success-100)] text-[var(--success-700)]',
        Icon: Check,
    }
}

function ringColor(adherence: number) {
    if (adherence >= 75) return 'var(--sport-500)'
    if (adherence >= 50) return 'var(--warning-500)'
    return 'var(--danger-500)'
}

function lastDot(days: number) {
    if (days < 3) return 'bg-[var(--success-500)]'
    if (days < 7) return 'bg-[var(--warning-500)]'
    return 'bg-[var(--danger-500)]'
}

function lastLabel(days: number | null) {
    if (days == null) return '—'
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Ayer'
    return `Hace ${days}d`
}

interface DirRowCardProps {
    client: any
    pulse: DirectoryPulseRow | null | undefined
    onActions: () => void
    selectMode?: boolean
    selected?: boolean
    onToggleSelect?: () => void
    /** «Alumno/Paciente/Atleta de ejemplo» según la persona del coach (onboarding v2 F3.7). */
    demoLabel?: string
}

export function DirRowCard({
    client,
    pulse,
    onActions,
    selectMode = false,
    selected = false,
    onToggleSelect,
    demoLabel = 'Alumno de ejemplo',
}: DirRowCardProps) {
    const router = useRouter()
    const score = pulse?.attentionScore ?? 0
    const adherence = pulse?.percentage ?? 0
    const sev = severityMeta(score)
    const SevIcon = sev.Icon

    const last = pulse?.lastWorkoutDate
    const daysSince = last ? differenceInDays(new Date(), new Date(last)) : null
    const dot = lastDot(daysSince == null ? 999 : daysSince)

    const nutritionPct = pulse?.nutritionPercentage ?? 0
    const nutriRisk =
        (pulse?.attentionFlags ?? []).includes('NUTRICION_RIESGO') || nutritionPct < 60
    const hasNutritionData = nutritionPct > 0

    const st = getClientStatusMeta(clientStatusInputFromRow(client))

    const profileHref = `/coach/clients/${client.id}`
    const archived = client.is_archived === true
    const selectable = selectMode && !archived

    return (
        <div
            role={selectable ? 'checkbox' : 'button'}
            aria-checked={selectable ? selected : undefined}
            aria-label={selectable ? `Seleccionar ${client.full_name}` : archived ? `Acciones de ${client.full_name}` : `Ver ficha de ${client.full_name}`}
            tabIndex={0}
            onClick={() => {
                if (selectable) onToggleSelect?.()
                else if (archived) onActions()
                else router.push(profileHref)
            }}
            onKeyDown={(e) => {
                if (selectable) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onToggleSelect?.()
                    }
                } else if (e.key === 'Enter' && archived) {
                    onActions()
                } else if (e.key === 'Enter') {
                    router.push(profileHref)
                }
            }}
            className={cn(
                'flex cursor-pointer items-center gap-3 rounded-card border p-3.5 shadow-[var(--shadow-xs)] transition-colors',
                selected
                    ? 'border-sport-500 bg-sport-100'
                    : 'border-subtle bg-surface-card hover:bg-surface-sunken'
            )}
        >
            {selectable && (
                <span
                    className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors',
                        selected
                            ? 'border-sport-500 bg-sport-500 text-white'
                            : 'border-default bg-surface-card text-transparent'
                    )}
                >
                    <Check className="h-4 w-4" />
                </span>
            )}
            <div className="relative h-[50px] w-[50px] shrink-0">
                <CircularProgressbar
                    value={adherence}
                    strokeWidth={5}
                    styles={buildStyles({
                        pathColor: ringColor(adherence),
                        trailColor: 'var(--track)',
                        strokeLinecap: 'round',
                    })}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-lg font-black uppercase text-strong">
                        {client.full_name?.[0] ?? '?'}
                    </span>
                </div>
                <span
                    className={cn(
                        'absolute -bottom-px -right-px h-[13px] w-[13px] rounded-full border-2 border-[var(--surface-card)]',
                        dot
                    )}
                />
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-display text-[15.5px] font-black tracking-tight text-strong">
                        {client.full_name}
                    </span>
                    {client.is_demo === true ? <DemoClientBadge label={demoLabel} /> : null}
                    {pulse ? (
                        <span
                            className={cn(
                                'inline-flex h-[19px] shrink-0 items-center gap-1 rounded-pill px-1.5 text-[10.5px] font-bold',
                                sev.cls
                            )}
                        >
                            <SevIcon className="h-[11px] w-[11px]" />
                            {sev.label}
                        </span>
                    ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-mono font-bold text-strong">{adherence}%</span>
                    <span className="text-[var(--border-strong)]">·</span>
                    <span>{lastLabel(daysSince)}</span>
                    {hasNutritionData && nutriRisk ? (
                        <>
                            <span className="text-[var(--border-strong)]">·</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--ember-700)]">
                                <Apple className="h-3 w-3" />
                                {nutritionPct}%
                            </span>
                        </>
                    ) : null}
                    {st.key !== 'active' ? (
                        <span
                            className={cn(
                                'whitespace-nowrap rounded-pill px-1.5 py-px text-[10.5px] font-bold',
                                st.cls
                            )}
                        >
                            {st.label}
                        </span>
                    ) : null}
                </div>
            </div>

            {!selectMode && (
                <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Acciones de ${client.full_name}`}
                    icon={<MoreVertical />}
                    onClick={(e) => {
                        e.stopPropagation()
                        onActions()
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                />
            )}
        </div>
    )
}
