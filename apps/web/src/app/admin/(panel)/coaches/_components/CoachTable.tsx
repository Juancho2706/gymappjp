'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, ChevronDown, ChevronUp, Users, Plus, StickyNote } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { AdminSortHeader } from '../../_components/AdminSortHeader'
import { AdminEmptyState } from '../../_components/AdminEmptyState'
import { AdminBulkBar } from '../../_components/AdminBulkBar'
import { CoachCommandPanel } from './CoachCommandPanel'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { bulkCoachStatusAction, deleteCoachAction, getCoachNotesAction, saveCoachNotesAction } from '../_actions/coach-actions'
import { CoachCreateSheet } from './CoachCreateSheet'
import type { CoachListItem, LifecycleStage } from '../../dashboard/_data/types'

function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
    const map: Record<LifecycleStage, { label: string; cls: string }> = {
        new_trial:      { label: 'Trial',        cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
        active_healthy: { label: 'Activo',       cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
        active_atRisk:  { label: 'En riesgo',    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
        expiring_soon:  { label: 'Vence pronto', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
        expired:        { label: 'Expirado',     cls: 'bg-zinc-500/15 text-zinc-500' },
        churned:        { label: 'Perdido',      cls: 'bg-rose-500/15 text-rose-500' },
        pending:        { label: 'Pago pend.',   cls: 'bg-purple-500/15 text-purple-500' },
    }
    const { label, cls } = map[stage] ?? map.active_healthy
    return (
        <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${cls}`}>
            {label}
        </span>
    )
}

function computeHealthScore(c: CoachListItem): number {
    const isFree = c.subscription_tier === 'free'
    // free tier: max 80 (no expiry component — always null, penalizaría injustamente)
    let s = ({ active: isFree ? 30 : 40, trialing: 30, past_due: 10, canceled: 5 } as Record<string, number>)[c.subscription_status ?? ''] ?? 0
    const u = c.utilization_pct ?? 0
    s += u >= 80 ? 30 : u >= 50 ? 20 : u >= 20 ? 10 : 0
    if (!isFree) {
        const d = c.days_until_expiry
        if (d !== null && d !== undefined) s += d > 30 ? 20 : d > 15 ? 10 : d > 7 ? 5 : 0
    }
    if (c.last_activity_at) s += 10
    return s
}

function healthColor(score: number, isFree: boolean): string {
    if (isFree) return score >= 60 ? 'bg-[--admin-green]' : score >= 30 ? 'bg-[--admin-amber]' : 'bg-[--admin-red]'
    return score >= 70 ? 'bg-[--admin-green]' : score >= 40 ? 'bg-[--admin-amber]' : 'bg-[--admin-red]'
}

function LastActivityDays({ iso }: { iso: string }) {
    const [nowMs, setNowMs] = useState<number | null>(null)
    useEffect(() => {
        setNowMs(Date.now())
    }, [])
    if (nowMs === null) return <span className="text-[--admin-text-3]">…</span>
    const diffMs = nowMs - new Date(iso).getTime()
    const d = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    if (d === 0) {
        const h = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)))
        if (h === 0) return <span className="text-xs text-emerald-500 font-medium">hace &lt;1h</span>
        return <span className="text-xs text-emerald-500 font-medium">hace {h}h</span>
    }
    return <span className="text-xs text-[--admin-text-3]">hace {d}d</span>
}

function HealthBar({ score, isFree }: { score: number; isFree: boolean }) {
    const color = healthColor(score, isFree)
    return (
        <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-16 rounded-full bg-[--admin-border] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[--admin-text-3]">{score}</span>
        </div>
    )
}

function NotesPopover({ coachId, onClose }: { coachId: string; onClose: () => void }) {
    const [notes, setNotes] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        getCoachNotesAction(coachId).then(n => { setNotes(n); setLoading(false) })
    }, [coachId])

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    async function save() {
        setSaving(true)
        await saveCoachNotesAction(coachId, notes)
        setSaving(false)
        onClose()
    }

    return (
        <div
            ref={ref}
            className="absolute right-8 top-0 z-50 w-64 rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] shadow-xl p-3 space-y-2"
            onClick={e => e.stopPropagation()}
        >
            <p className="text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Nota interna</p>
            {loading ? (
                <div className="h-20 animate-pulse rounded bg-[--admin-bg-elevated]" />
            ) : (
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded border border-[--admin-border] bg-[--admin-bg-elevated] p-2 text-xs text-[--admin-text-1] placeholder:text-[--admin-text-3] focus:outline-none focus:border-[--admin-accent]"
                    placeholder="Notas visibles solo para admins..."
                    autoFocus
                />
            )}
            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-xs text-[--admin-text-3] hover:text-[--admin-text-2]">
                    Cancelar
                </button>
                <button
                    onClick={save}
                    disabled={saving || loading}
                    className="rounded bg-[--admin-accent] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    )
}

function ExpiryCell({ days }: { days: number | null | undefined }) {
    if (days === null || days === undefined) return <span className="text-[--admin-text-3]">—</span>
    if (days < 0) return <span className="font-mono text-xs text-[--admin-text-3]">vencido</span>
    const color = days < 7 ? 'text-[--admin-red]' : days < 14 ? 'text-[--admin-amber]' : 'text-[--admin-text-2]'
    return <span className={`font-mono text-xs tabular-nums ${color}`}>{days}d</span>
}

function isAtRisk(c: CoachListItem): boolean {
    if ((c.days_until_expiry ?? 1) <= 7) return true
    if (['past_due', 'pending_payment'].includes(c.subscription_status ?? '')) return true
    return false
}

interface Props {
    coaches: CoachListItem[]
    total: number
}

export function CoachTable({ coaches, total }: Props) {
    const router = useRouter()
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [editing, setEditing] = useState<CoachListItem | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [riskOpen, setRiskOpen] = useState(true)
    const [createOpen, setCreateOpen] = useState(false)
    const [notesOpen, setNotesOpen] = useState<string | null>(null)

    const atRisk = coaches.filter(isAtRisk)

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleAll() {
        if (selected.size === coaches.length) setSelected(new Set())
        else setSelected(new Set(coaches.map(c => c.id)))
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar este coach? Esta acción es IRREVERSIBLE.')) return
        setDeleting(id)
        await deleteCoachAction(id)
        setDeleting(null)
        router.refresh()
    }

    async function bulkExpire() {
        if (!confirm(`¿Forzar expiración de ${selected.size} coaches? Verán /reactivate en su próxima visita.`)) return
        await bulkCoachStatusAction([...selected], 'expired')
        setSelected(new Set())
        router.refresh()
    }

    async function bulkReactivate() {
        if (!confirm(`¿Reactivar ${selected.size} coaches?`)) return
        await bulkCoachStatusAction([...selected], 'active')
        setSelected(new Set())
        router.refresh()
    }

    return (
        <div className="space-y-3">
            {/* Header actions */}
            <div className="flex justify-end">
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-[--admin-border] bg-[--admin-bg-elevated] px-3 py-1.5 text-xs text-[--admin-text-1] hover:border-[--admin-accent] hover:text-[--admin-accent] transition-colors"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Coach
                </button>
            </div>

            {/* At-risk strip */}
            {atRisk.length > 0 && (
                <div className="rounded-lg border border-[--admin-amber]/30 bg-[--admin-amber]/5">
                    <button
                        onClick={() => setRiskOpen(o => !o)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-[--admin-amber]" />
                            <span className="text-xs font-medium text-[--admin-amber]">
                                {atRisk.length} coach{atRisk.length !== 1 ? 's' : ''} necesita{atRisk.length === 1 ? '' : 'n'} atención
                            </span>
                        </div>
                        {riskOpen ? <ChevronUp className="h-3.5 w-3.5 text-[--admin-amber]" /> : <ChevronDown className="h-3.5 w-3.5 text-[--admin-amber]" />}
                    </button>
                    {riskOpen && (
                        <div className="border-t border-[--admin-amber]/20 divide-y divide-[--admin-amber]/10">
                            {atRisk.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setEditing(c)}
                                    className="flex w-full items-center justify-between px-4 py-2 hover:bg-[--admin-amber]/10 transition-colors text-left"
                                >
                                    <span className="text-sm text-[--admin-text-1]">{c.brand_name || c.full_name}</span>
                                    <div className="flex items-center gap-2">
                                        <AdminStatusBadge value={c.subscription_status ?? ''} />
                                        <ExpiryCell days={c.days_until_expiry} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="border-b border-[--admin-border]">
                            <tr>
                                <th className="w-8 px-3 py-2 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selected.size === coaches.length && coaches.length > 0}
                                        onChange={toggleAll}
                                        className="rounded border-[--admin-border] accent-[--admin-accent]"
                                    />
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Coach</th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                        Health
                                        <InfoTooltip content="Puntuación 0-100: estado de suscripción + uso de alumnos (30pts) + días hasta vencimiento (20pts, solo pagantes) + actividad reciente (10pts). Free: escala 0-80." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                        Provider
                                        <InfoTooltip content="Origen del pago. 'free/admin' = cuenta gratuita. 'beta' = acceso prueba sin pago. 'MP' = suscripción activa pagando. 'internal' = cuenta interna." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Tier</th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                        Status
                                        <InfoTooltip content="active=pagando, trialing=en prueba, expired=debe reactivar, past_due=cobro fallido, paused=suspendido por admin, canceled=canceló pero acceso hasta vencimiento." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Ciclo</th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">MRR</th>
                                <AdminSortHeader label="Vence" sortKey="expiry" />
                                <AdminSortHeader label="Alumnos" sortKey="clients" />
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                        Última actividad
                                        <InfoTooltip content="Última vez que el coach realizó una acción en la plataforma (guardar plan, agregar ejercicio, etc.)." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Registrado</th>
                                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Acc.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[--admin-border]">
                            {coaches.length === 0 && (
                                <tr>
                                    <td colSpan={12}>
                                        <AdminEmptyState icon={Users} title="Sin coaches" description="Ajusta los filtros para ver resultados." />
                                    </td>
                                </tr>
                            )}
                            {coaches.map(c => {
                                const isFree = c.subscription_tier === 'free'
                                const score = computeHealthScore(c)
                                const isSelected = selected.has(c.id)
                                return (
                                    <tr
                                        key={c.id}
                                        className={`transition-colors hover:bg-[--admin-bg-elevated] ${isSelected ? 'bg-[--admin-accent]/5' : ''}`}
                                    >
                                        <td className="px-3 py-2.5">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(c.id)}
                                                className="rounded border-[--admin-border] accent-[--admin-accent]"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <button onClick={() => setEditing(c)} className="text-left group">
                                                <p className="text-sm font-medium text-[--admin-text-1] group-hover:text-[--admin-accent] transition-colors">
                                                    {c.brand_name || c.full_name || '—'}
                                                </p>
                                                <p className="font-mono text-[10px] text-[--admin-text-3]">/c/{c.slug}</p>
                                                {c.auth_email && (
                                                    <p className="text-[10px] text-[--admin-text-3] truncate max-w-[180px]">{c.auth_email}</p>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5"><HealthBar score={score} isFree={isFree} /></td>
                                        <td className="px-3 py-2.5">
                                            <AdminStatusBadge value={c.payment_provider ?? ''} type="provider" />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <AdminStatusBadge value={c.subscription_tier ?? ''} type="tier" />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <AdminStatusBadge
                                                value={isFree && c.subscription_status === 'active' ? 'free_active' : (c.subscription_status ?? '')}
                                            />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <LifecycleBadge stage={c.lifecycle_stage} />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {c.monthly_revenue > 0 ? (
                                                <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                                                    ${c.monthly_revenue.toLocaleString('es-CL')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-[--admin-text-3]">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <ExpiryCell days={c.days_until_expiry} />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-mono text-xs tabular-nums text-[--admin-text-2]">
                                                {c.active_client_count}/{c.max_clients ?? '?'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {c.coach_last_active_at ? (
                                                <LastActivityDays iso={c.coach_last_active_at} />
                                            ) : (
                                                <span className="text-xs text-[--admin-text-3]">nunca</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-mono text-[11px] tabular-nums text-[--admin-text-3]" title={c.created_at}>
                                                {format(new Date(c.created_at), 'dd/MM/yy', { locale: es })}
                                            </span>
                                        </td>
                                        <td className="relative px-3 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={e => { e.stopPropagation(); setNotesOpen(notesOpen === c.id ? null : c.id) }}
                                                    className="rounded p-1 text-[--admin-text-3] hover:text-[--admin-accent] transition-colors"
                                                    title="Nota interna"
                                                >
                                                    <StickyNote className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(c.id)}
                                                    disabled={deleting === c.id}
                                                    className="rounded p-1 text-[--admin-text-3] hover:text-[--admin-red] transition-colors disabled:opacity-30"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            {notesOpen === c.id && (
                                                <NotesPopover coachId={c.id} onClose={() => setNotesOpen(null)} />
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk action bar */}
            <AdminBulkBar
                count={selected.size}
                actions={[
                    { label: 'Forzar expiración', onClick: bulkExpire, variant: 'danger' },
                    { label: 'Reactivar', onClick: bulkReactivate, variant: 'default' },
                ]}
                onClear={() => setSelected(new Set())}
            />

            {/* Command panel */}
            {editing && (
                <CoachCommandPanel
                    coach={editing}
                    open={!!editing}
                    onClose={() => setEditing(null)}
                />
            )}

            {/* Create sheet */}
            <CoachCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    )
}
