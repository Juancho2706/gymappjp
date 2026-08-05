'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, AlertTriangle, ChevronDown, ChevronUp, Users, Plus, StickyNote, Settings2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { AdminSortHeader } from '../../_components/AdminSortHeader'
import { AdminEmptyState } from '../../_components/AdminEmptyState'
import { AdminBulkBar } from '../../_components/AdminBulkBar'
import { AdminPagination } from '../../_components/AdminPagination'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { CoachCommandPanel } from './CoachCommandPanel'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { bulkCoachStatusAction, deleteCoachAction, getCoachNotesAction, saveCoachNotesAction } from '../_actions/coach-actions'
import { CoachCreateSheet } from './CoachCreateSheet'
import type { CoachListItem, LifecycleStage } from '../../dashboard/_data/types'

function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
    const map: Record<LifecycleStage, { label: string; cls: string }> = {
        new_trial:      { label: 'Trial',        cls: 'bg-[var(--sport-300)]/15 text-[var(--sport-300)]' },
        active_healthy: { label: 'Activo',       cls: 'bg-[var(--success-500)]/15 text-[var(--success-500)]' },
        active_atRisk:  { label: 'En riesgo',    cls: 'bg-[var(--warning-500)]/15 text-[var(--warning-500)]' },
        expiring_soon:  { label: 'Vence pronto', cls: 'bg-[var(--warning-500)]/15 text-[var(--warning-500)]' },
        expired:        { label: 'Expirado',     cls: 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]' },
        churned:        { label: 'Perdido',      cls: 'bg-[var(--danger-500)]/15 text-[var(--danger-500)]' },
        pending:        { label: 'Pago pend.',   cls: 'bg-[var(--warning-500)]/15 text-[var(--warning-500)]' },
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
    if (isFree) return score >= 60 ? 'bg-[var(--success-500)]' : score >= 30 ? 'bg-[var(--warning-500)]' : 'bg-[var(--danger-500)]'
    return score >= 70 ? 'bg-[var(--success-500)]' : score >= 40 ? 'bg-[var(--warning-500)]' : 'bg-[var(--danger-500)]'
}

function LastActivityDays({ iso }: { iso: string }) {
    const [nowMs, setNowMs] = useState<number | null>(null)
    useEffect(() => {
        setNowMs(Date.now())
    }, [])
    if (nowMs === null) return <span className="text-muted">…</span>
    const diffMs = nowMs - new Date(iso).getTime()
    const d = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    if (d === 0) {
        const h = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)))
        if (h === 0) return <span className="text-xs text-[var(--success-500)] font-medium">hace &lt;1h</span>
        return <span className="text-xs text-[var(--success-500)] font-medium">hace {h}h</span>
    }
    return <span className="text-xs text-muted">hace {d}d</span>
}

function HealthBar({ score, isFree }: { score: number; isFree: boolean }) {
    const color = healthColor(score, isFree)
    return (
        <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-16 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted">{score}</span>
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
        // saveCoachNotesAction devuelve void: el unico canal de error es la excepcion.
        try {
            await saveCoachNotesAction(coachId, notes)
            toast.success('Nota guardada')
            onClose()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la nota')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            ref={ref}
            className="absolute right-8 top-0 z-50 w-64 rounded-lg border border-subtle bg-surface-card shadow-xl p-3 space-y-2"
            onClick={e => e.stopPropagation()}
        >
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted">Nota interna</p>
            {loading ? (
                <div className="h-20 animate-pulse rounded bg-surface-sunken" />
            ) : (
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded border border-subtle bg-surface-sunken p-2 text-xs text-strong placeholder:text-muted focus:outline-none focus:border-[var(--sport-500)]"
                    placeholder="Notas visibles solo para admins..."
                    autoFocus
                />
            )}
            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-xs text-muted hover:text-body">
                    Cancelar
                </button>
                <button
                    onClick={save}
                    disabled={saving || loading}
                    className="rounded bg-[var(--cta-fill)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    )
}

function ExpiryCell({ days }: { days: number | null | undefined }) {
    if (days === null || days === undefined) return <span className="text-muted">—</span>
    if (days < 0) return <span className="font-mono text-xs text-muted">vencido</span>
    const color = days < 7 ? 'text-[var(--danger-500)]' : days < 14 ? 'text-[var(--warning-500)]' : 'text-body'
    return <span className={`font-mono text-xs tabular-nums ${color}`}>{days}d</span>
}

function isAtRisk(c: CoachListItem): boolean {
    // Sin fecha de vencimiento NO es riesgo: el `?? 1` viejo convertia null en "vence en 1d"
    // y marcaba en riesgo a TODO coach free/cortesia de por vida (25 falsos positivos en prod).
    const d = c.days_until_expiry
    if (d !== null && d !== undefined && d <= 7) return true
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
    // Contraida por defecto (pedido owner 05-08): el contador del header basta; se expande a mano.
    const [riskOpen, setRiskOpen] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [notesOpen, setNotesOpen] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<CoachListItem | null>(null)
    // Snapshot de ids al abrir: el dialogo muestra el alcance en numeros y la seleccion
    // no debe poder cambiar bajo sus pies entre "leer el blast radius" y "confirmar".
    const [confirmBulk, setConfirmBulk] = useState<{ kind: 'expire' | 'reactivate'; ids: string[] } | null>(null)

    const atRisk = coaches.filter(isAtRisk)
    const bulkCount = confirmBulk?.ids.length ?? 0

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

    // Los tres flujos destructivos usaban confirm() nativo y TIRABAN el {error} de la action:
    // un bulk que fallaba a la mitad se veia identico a uno exitoso (F3 08-05).
    async function handleDelete(c: CoachListItem) {
        setDeleting(c.id)
        const res = await deleteCoachAction(c.id)
        setDeleting(null)
        if (res?.error) {
            toast.error(res.error)
            return
        }
        toast.success(`Coach ${c.brand_name || c.full_name || c.slug} eliminado`)
        router.refresh()
    }

    async function runBulk(kind: 'expire' | 'reactivate', ids: string[]) {
        const n = ids.length
        const res = await bulkCoachStatusAction(ids, kind === 'expire' ? 'expired' : 'active')
        if (res?.error) {
            toast.error(res.error)
            return
        }
        toast.success(
            kind === 'expire'
                ? `${n} coach${n !== 1 ? 'es' : ''} expirado${n !== 1 ? 's' : ''}`
                : `${n} coach${n !== 1 ? 'es' : ''} reactivado${n !== 1 ? 's' : ''} (+30 días)`
        )
        setSelected(new Set())
        router.refresh()
    }

    return (
        <div className="space-y-3">
            {/* Header actions */}
            <div className="flex justify-end">
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-1.5 text-xs text-strong hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Coach
                </button>
            </div>

            {/* At-risk strip */}
            {atRisk.length > 0 && (
                <div className="rounded-lg border border-[var(--warning-500)]/30 bg-[var(--warning-500)]/5">
                    <button
                        onClick={() => setRiskOpen(o => !o)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning-500)]" />
                            <span className="text-xs font-medium text-[var(--warning-500)]">
                                {atRisk.length} coach{atRisk.length !== 1 ? 's' : ''} necesita{atRisk.length === 1 ? '' : 'n'} atención
                            </span>
                        </div>
                        {riskOpen ? <ChevronUp className="h-3.5 w-3.5 text-[var(--warning-500)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--warning-500)]" />}
                    </button>
                    {riskOpen && (
                        <div className="border-t border-[var(--warning-500)]/20 divide-y divide-[var(--warning-500)]/10">
                            {atRisk.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setEditing(c)}
                                    className="flex w-full items-center justify-between px-4 py-2 hover:bg-[var(--warning-500)]/10 transition-colors text-left"
                                >
                                    <span className="text-sm text-strong">{c.brand_name || c.full_name}</span>
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

            {/* ── Mobile: cards (13 columnas bajo md eran scroll horizontal ciego) ── */}
            <div className="space-y-2 md:hidden">
                {coaches.length === 0 && (
                    <div className="rounded-card border border-subtle bg-surface-card">
                        <AdminEmptyState icon={Users} title="Sin coaches" description="Ajusta los filtros para ver resultados." />
                    </div>
                )}
                {coaches.map(c => {
                    const isSelected = selected.has(c.id)
                    return (
                        <div
                            key={c.id}
                            className={`relative rounded-card border bg-surface-card p-3 transition-colors ${
                                isSelected ? 'border-[var(--sport-500)]' : 'border-subtle'
                            }`}
                        >
                            {/* El bulk existia solo en desktop: sin checkbox en la card, la barra
                                de acciones masivas era inalcanzable en telefono. */}
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(c.id)}
                                aria-label={`Seleccionar ${c.brand_name || c.full_name || c.slug}`}
                                className="absolute right-3 top-3 rounded border-subtle accent-[var(--sport-500)]"
                            />

                            <div className="pr-8">
                                <Link
                                    href={`/admin/coaches/${c.id}`}
                                    className="text-sm font-medium text-strong hover:text-[var(--sport-500)] transition-colors"
                                >
                                    {c.brand_name || c.full_name || '—'}
                                </Link>
                                <p className="font-mono text-[10px] text-muted">/c/{c.slug}</p>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <AdminStatusBadge
                                    value={c.subscription_tier === 'free' && c.subscription_status === 'active'
                                        ? 'free_active'
                                        : (c.subscription_status ?? '')}
                                />
                                <AdminStatusBadge value={c.subscription_tier ?? ''} type="tier" />
                                <LifecycleBadge stage={c.lifecycle_stage} />
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted">
                                    MRR{' '}
                                    {c.monthly_revenue > 0 ? (
                                        <span className="font-mono tabular-nums text-[var(--success-500)]">
                                            ${c.monthly_revenue.toLocaleString('es-CL')}
                                        </span>
                                    ) : (
                                        <span className="text-muted">—</span>
                                    )}
                                </span>
                                <span className="flex items-center gap-1 text-muted">
                                    Vence <ExpiryCell days={c.days_until_expiry} />
                                </span>
                            </div>

                            <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted">
                                    Alumnos{' '}
                                    <span className="font-mono tabular-nums text-body">
                                        {c.active_client_count}/{c.max_clients ?? '?'}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1 text-muted">
                                    Actividad{' '}
                                    {c.coach_last_active_at
                                        ? <LastActivityDays iso={c.coach_last_active_at} />
                                        : <span className="text-xs text-muted">nunca</span>}
                                </span>
                            </div>

                            <button
                                onClick={() => setEditing(c)}
                                title="Gestión rápida"
                                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-pill border border-subtle bg-surface-sunken py-2 text-xs font-medium text-strong transition-colors hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                Gestionar
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* ── Desktop: tabla ── */}
            <div className="hidden rounded-xl border border-subtle bg-surface-card overflow-hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="border-b border-subtle">
                            <tr>
                                {/* Columna identidad sticky: con 12 columnas el nombre del coach se
                                    perdia al scrollear a la derecha y no sabias que fila mirabas. */}
                                <th className="sticky left-0 z-20 border-r border-subtle bg-surface-card px-3 py-2 text-left">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selected.size === coaches.length && coaches.length > 0}
                                            onChange={toggleAll}
                                            aria-label="Seleccionar todos"
                                            className="rounded border-subtle accent-[var(--sport-500)]"
                                        />
                                        <span className="text-[11px] font-medium uppercase tracking-widest text-muted">Coach</span>
                                    </div>
                                </th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-muted">
                                        Health
                                        <InfoTooltip content="Puntuación 0-100: estado de suscripción + uso de alumnos (30pts) + días hasta vencimiento (20pts, solo pagantes) + actividad reciente (10pts). Free: escala 0-80." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-muted">
                                        Provider
                                        <InfoTooltip content="Origen del pago. 'free/admin' = cuenta gratuita. 'beta' = acceso prueba sin pago. 'MP' = suscripción activa pagando. 'internal' = cuenta interna." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Tier</th>
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-muted">
                                        Status
                                        <InfoTooltip content="active=pagando, trialing=en prueba, expired=debe reactivar, past_due=cobro fallido, paused=suspendido por admin, canceled=canceló pero acceso hasta vencimiento." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Ciclo</th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">MRR</th>
                                <AdminSortHeader label="Vence" sortKey="expiry" />
                                <AdminSortHeader label="Alumnos" sortKey="clients" />
                                <th className="px-3 py-2 text-left">
                                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-muted">
                                        Última actividad
                                        <InfoTooltip content="Última vez que el coach realizó una acción en la plataforma (guardar plan, agregar ejercicio, etc.)." />
                                    </span>
                                </th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Registrado</th>
                                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-muted">Acc.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
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
                                        onClick={() => setEditing(c)}
                                        title="Gestión rápida"
                                        className={`group cursor-pointer transition-colors hover:bg-surface-sunken ${isSelected ? 'bg-sport-500/5' : ''}`}
                                    >
                                        {/* Sticky = necesita fondo OPACO propio; el hover de la fila no
                                            lo alcanza solo, por eso group-hover explicito.
                                            stopPropagation: aqui viven el Link a la ficha y el checkbox,
                                            que NO deben disparar el panel de gestion rapida de la fila. */}
                                        <td
                                            onClick={e => e.stopPropagation()}
                                            className={`sticky left-0 z-10 border-r border-subtle bg-surface-card px-3 py-2.5 transition-colors group-hover:bg-surface-sunken ${
                                                isSelected ? 'shadow-[inset_2px_0_0_var(--sport-500)]' : ''
                                            }`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(c.id)}
                                                    aria-label={`Seleccionar ${c.brand_name || c.full_name || c.slug}`}
                                                    className="mt-1 rounded border-subtle accent-[var(--sport-500)]"
                                                />
                                                <div className="min-w-0">
                                                    {/* El nombre lleva a la ficha completa; el resto de la fila
                                                        sigue abriendo el panel de gestion rapida. */}
                                                    <Link
                                                        href={`/admin/coaches/${c.id}`}
                                                        className="text-sm font-medium text-strong hover:text-[var(--sport-500)] transition-colors"
                                                    >
                                                        {c.brand_name || c.full_name || '—'}
                                                    </Link>
                                                    <p className="font-mono text-[10px] text-muted">/c/{c.slug}</p>
                                                    {c.auth_email && (
                                                        <p className="text-[10px] text-muted truncate max-w-[180px]">{c.auth_email}</p>
                                                    )}
                                                </div>
                                            </div>
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
                                                <span className="font-mono text-xs tabular-nums text-[var(--success-500)]">
                                                    ${c.monthly_revenue.toLocaleString('es-CL')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <ExpiryCell days={c.days_until_expiry} />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-mono text-xs tabular-nums text-body">
                                                {c.active_client_count}/{c.max_clients ?? '?'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {c.coach_last_active_at ? (
                                                <LastActivityDays iso={c.coach_last_active_at} />
                                            ) : (
                                                <span className="text-xs text-muted">nunca</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-mono text-[11px] tabular-nums text-muted" title={c.created_at}>
                                                {format(new Date(c.created_at), 'dd/MM/yy', { locale: es })}
                                            </span>
                                        </td>
                                        <td className="relative px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => setNotesOpen(notesOpen === c.id ? null : c.id)}
                                                    className="rounded p-1 text-muted hover:text-[var(--sport-500)] transition-colors"
                                                    title="Nota interna"
                                                >
                                                    <StickyNote className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(c)}
                                                    disabled={deleting === c.id}
                                                    className="rounded p-1 text-muted hover:text-[var(--danger-500)] transition-colors disabled:opacity-30"
                                                    title="Eliminar coach"
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

            {/* Paginacion: la tabla recibia `total` y nunca lo usaba — con >50 coaches el
                resto solo existia editando la URL a mano (ROTO-1, F0 08-05). */}
            <AdminPagination total={total} pageSize={50} />

            {/* Bulk action bar */}
            <AdminBulkBar
                count={selected.size}
                actions={[
                    { label: 'Forzar expiración', onClick: () => setConfirmBulk({ kind: 'expire', ids: [...selected] }), variant: 'danger' },
                    { label: 'Reactivar', onClick: () => setConfirmBulk({ kind: 'reactivate', ids: [...selected] }), variant: 'default' },
                ]}
                onClear={() => setSelected(new Set())}
            />

            {/* Confirmaciones — el CEO decide viendo el alcance en numeros reales */}
            <AdminConfirmDialog
                open={confirmDelete !== null}
                onOpenChange={o => { if (!o) setConfirmDelete(null) }}
                title="¿Eliminar coach?"
                description={`Vas a eliminar a ${confirmDelete?.brand_name || confirmDelete?.full_name || confirmDelete?.slug || 'este coach'}.`}
                blastRadius="Borra el usuario y todos sus datos. Irreversible."
                severity="danger"
                confirmLabel="Eliminar coach"
                requireText={confirmDelete?.slug}
                onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete) }}
            />

            <AdminConfirmDialog
                open={confirmBulk?.kind === 'expire'}
                onOpenChange={o => { if (!o) setConfirmBulk(null) }}
                title="¿Forzar expiración?"
                description="Los coaches verán /reactivate en su próxima visita y deberán pagar para continuar."
                blastRadius={`${bulkCount} coach${bulkCount !== 1 ? 'es' : ''}: cancela sus suscripciones en la pasarela y ancla la gracia de sus alumnos`}
                severity="danger"
                confirmLabel="Forzar expiración"
                onConfirm={async () => { if (confirmBulk) await runBulk('expire', confirmBulk.ids) }}
            />

            <AdminConfirmDialog
                open={confirmBulk?.kind === 'reactivate'}
                onOpenChange={o => { if (!o) setConfirmBulk(null) }}
                title="¿Reactivar coaches?"
                description="Pasan a estado activo y se les extiende el período."
                blastRadius={`${bulkCount} coach${bulkCount !== 1 ? 'es' : ''}: +30 días de acceso`}
                severity="warning"
                confirmLabel="Reactivar"
                onConfirm={async () => { if (confirmBulk) await runBulk('reactivate', confirmBulk.ids) }}
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
