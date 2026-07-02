'use client'

import { differenceInDays } from 'date-fns'
import { Apple, ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectorySortKey } from './directory-types'
import { cn } from '@/lib/utils'

// ===== DirTable · vista tabla densa (9 columnas, scroll horizontal, Alumno fija) =====
// Transcripción del DirTable del diseño coach-directory.jsx (L496-579).

interface ColDef {
    id: string
    label: string
    w: number
    sort?: DirectorySortKey
    sticky?: boolean
    align?: 'left' | 'center'
}

const COLS: ColDef[] = [
    { id: 'name', label: 'Alumno', w: 150, sort: 'name_asc', sticky: true, align: 'left' },
    { id: 'status', label: 'Estado', w: 84, align: 'left' },
    { id: 'score', label: 'Score', w: 64, sort: 'attention_score', align: 'center' },
    { id: 'adh', label: 'Adh.', w: 96, sort: 'adherence_desc', align: 'left' },
    { id: 'weight', label: 'Peso', w: 92, sort: 'weight_delta', align: 'left' },
    { id: 'last', label: 'Último', w: 78, sort: 'last_activity', align: 'left' },
    { id: 'program', label: 'Programa', w: 150, align: 'left' },
    { id: 'days', label: 'Días', w: 56, sort: 'plan_days', align: 'center' },
    { id: 'acc', label: '', w: 44, align: 'center' },
]

function ringColor(adherence: number) {
    if (adherence >= 75) return 'var(--sport-500)'
    if (adherence >= 50) return 'var(--warning-500)'
    return 'var(--danger-500)'
}

function severityCls(score: number) {
    if (score >= 50) return 'bg-[var(--danger-100)] text-[var(--danger-700)]'
    if (score >= 25) return 'bg-[var(--warning-100)] text-[var(--warning-700)]'
    return 'bg-[var(--success-100)] text-[var(--success-700)]'
}

function statusMeta(client: any) {
    if (client.is_archived === true)
        return { label: 'Archivado', cls: 'bg-surface-sunken text-subtle' }
    if (client.is_active === false)
        return { label: 'Pausado', cls: 'bg-[var(--ink-100)] text-[var(--ink-600)]' }
    if (client.force_password_change)
        return { label: 'Pend. sync', cls: 'bg-[var(--info-100)] text-[var(--info-600)]' }
    return { label: 'Activo', cls: 'bg-[var(--success-100)] text-[var(--success-700)]' }
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

interface DirTableMobileProps {
    clients: any[]
    pulseByClientId: Record<string, DirectoryPulseRow>
    sortKey: DirectorySortKey
    sortDir: 'asc' | 'desc'
    onHeaderSort: (key: DirectorySortKey) => void
    onOpen: (clientId: string) => void
    onActions: (client: any) => void
}

export function DirTableMobile({
    clients,
    pulseByClientId,
    sortKey,
    sortDir,
    onHeaderSort,
    onOpen,
    onActions,
}: DirTableMobileProps) {
    const cellCls = (c: ColDef, body: boolean) =>
        cn(
            'flex shrink-0 items-center',
            c.align === 'center' ? 'justify-center' : 'justify-start',
            c.sticky &&
                cn('sticky left-0 z-[2] border-r border-subtle', body ? 'bg-surface-card' : 'bg-surface-sunken')
        )

    return (
        <div className="overflow-hidden rounded-card border border-subtle">
            <div className="overflow-x-auto overscroll-x-contain">
                <div className="min-w-min">
                    {/* header */}
                    <div className="flex border-b-[1.5px] border-default bg-surface-sunken">
                        {COLS.map((c) => {
                            const active = c.sort && sortKey === c.sort
                            const SortIcon = sortDir === 'asc' ? ChevronUp : ChevronDown
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    disabled={!c.sort}
                                    onClick={() => c.sort && onHeaderSort(c.sort)}
                                    style={{ width: c.w }}
                                    className={cn(
                                        cellCls(c, false),
                                        'gap-[3px] whitespace-nowrap px-2.5 py-[9px] font-ui text-[10.5px] font-bold uppercase tracking-[0.05em]',
                                        c.sort ? 'cursor-pointer' : 'cursor-default',
                                        active ? 'text-strong' : 'text-subtle'
                                    )}
                                >
                                    {c.label}
                                    {active && <SortIcon className="h-3 w-3" />}
                                </button>
                            )
                        })}
                    </div>
                    {/* rows */}
                    {clients.map((client, i) => {
                        const p = pulseByClientId[client.id]
                        const score = p?.attentionScore ?? 0
                        const adherence = p?.percentage ?? 0
                        const st = statusMeta(client)
                        const nutritionPct = p?.nutritionPercentage ?? 0
                        const nutriRisk =
                            (p?.attentionFlags ?? []).includes('NUTRICION_RIESGO') ||
                            (nutritionPct > 0 && nutritionPct < 60)
                        const last = p?.lastWorkoutDate
                        const daysSince = last ? differenceInDays(new Date(), new Date(last)) : null
                        const dW = p?.weightDelta7d
                        const programName = client.workout_programs?.find((x: any) => x.is_active)?.name
                        return (
                            <div
                                key={client.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onOpen(client.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onOpen(client.id)
                                }}
                                className={cn(
                                    'flex h-[52px] cursor-pointer items-stretch bg-surface-card',
                                    i < clients.length - 1 && 'border-b border-subtle'
                                )}
                            >
                                <div style={{ width: COLS[0].w }} className={cn(cellCls(COLS[0], true), 'px-2.5')}>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-[13px] font-extrabold text-sport-400">
                                            {client.full_name?.[0] ?? '?'}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-[13px] font-bold text-strong">
                                                {client.full_name}
                                            </div>
                                            <div className="truncate text-[10.5px] text-subtle">
                                                {client.email ?? '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ width: COLS[1].w }} className={cn(cellCls(COLS[1], true), 'px-2.5')}>
                                    <span
                                        className={cn(
                                            'whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold',
                                            st.cls
                                        )}
                                    >
                                        {st.label}
                                    </span>
                                </div>
                                <div style={{ width: COLS[2].w }} className={cn(cellCls(COLS[2], true), 'px-2.5')}>
                                    <span
                                        className={cn(
                                            'min-w-[26px] rounded-[var(--radius-xs)] px-1.5 py-0.5 text-center font-mono text-[12.5px] font-extrabold',
                                            severityCls(score)
                                        )}
                                    >
                                        {score}
                                    </span>
                                </div>
                                <div style={{ width: COLS[3].w }} className={cn(cellCls(COLS[3], true), 'px-2.5')}>
                                    <div className="flex w-full items-center gap-1.5">
                                        {nutriRisk && (
                                            <span
                                                title="Nutrición baja (<60%)"
                                                className="inline-flex shrink-0 text-[var(--ember-700)]"
                                            >
                                                <Apple className="h-[13px] w-[13px]" />
                                            </span>
                                        )}
                                        <div className="h-[5px] min-w-[20px] flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                                            <div
                                                className="h-full"
                                                style={{ width: `${adherence}%`, background: ringColor(adherence) }}
                                            />
                                        </div>
                                        <span className="shrink-0 font-mono text-[11.5px] font-bold text-strong">
                                            {adherence}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ width: COLS[4].w }} className={cn(cellCls(COLS[4], true), 'px-2.5')}>
                                    <div>
                                        <div className="font-mono text-[12.5px] font-bold text-strong">
                                            {p?.currentWeight != null ? `${p.currentWeight} kg` : '—'}
                                        </div>
                                        {dW != null && (
                                            <div
                                                className={cn(
                                                    'text-[10.5px] font-semibold',
                                                    dW < 0
                                                        ? 'text-[var(--success-600)]'
                                                        : dW > 0
                                                          ? 'text-[var(--danger-600)]'
                                                          : 'text-subtle'
                                                )}
                                            >
                                                {dW > 0 ? '+' : ''}
                                                {dW} (7d)
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ width: COLS[5].w }} className={cn(cellCls(COLS[5], true), 'px-2.5')}>
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className={cn(
                                                'h-2 w-2 shrink-0 rounded-full',
                                                lastDot(daysSince == null ? 999 : daysSince)
                                            )}
                                        />
                                        <span className="whitespace-nowrap text-xs text-body">
                                            {lastLabel(daysSince)}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ width: COLS[6].w }} className={cn(cellCls(COLS[6], true), 'px-2.5')}>
                                    <span
                                        className={cn(
                                            'truncate text-xs',
                                            programName ? 'text-body' : 'text-subtle'
                                        )}
                                    >
                                        {programName ?? '—'}
                                    </span>
                                </div>
                                <div style={{ width: COLS[7].w }} className={cn(cellCls(COLS[7], true), 'px-2.5')}>
                                    <span
                                        className={cn(
                                            'font-mono text-[12.5px] font-bold',
                                            p?.planDaysRemaining != null && p.planDaysRemaining <= 0
                                                ? 'text-[var(--danger-600)]'
                                                : 'text-strong'
                                        )}
                                    >
                                        {p?.planDaysRemaining != null ? p.planDaysRemaining : '—'}
                                    </span>
                                </div>
                                <div style={{ width: COLS[8].w }} className={cn(cellCls(COLS[8], true), 'px-2.5')}>
                                    <button
                                        type="button"
                                        aria-label={`Acciones de ${client.full_name}`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onActions(client)
                                        }}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-xs)] text-subtle"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
