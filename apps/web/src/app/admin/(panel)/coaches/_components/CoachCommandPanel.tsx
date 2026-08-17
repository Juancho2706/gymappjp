'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import {
    deleteCoachAction,
    extendCoachPeriodAction,
    suspendCoachAction,
    expireCoachAction,
    reactivateCoachAdminAction,
    updateCoachAction,
    sendIndividualCoachEmailAction,
    getCoachModulesAction,
    getCoachSubscriptionEvents,
    type SubscriptionEventRow,
} from '../_actions/coach-actions'
import { MODULE_KEYS, MODULE_LABELS } from '../../_components/module-labels'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import {
    ExternalLink, Copy, CheckCircle, AlertTriangle, Clock,
    RefreshCw, Pause, Zap, ShieldOff, Edit3, Activity, Mail, Palette, ArrowRight
} from 'lucide-react'
import type { CoachListItem } from '../../dashboard/_data/types'
import { TIER_CONFIG } from '@eva/tiers'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Union COMPLETO derivado de las constantes (mejora #7: NO re-hardcodear las listas de tiers del admin).
// Incluye growth/scale (LEGACY, fuera de venta) — el admin gestiona cuentas grandfathered.
const ALL_TIERS = Object.keys(TIER_CONFIG) as Array<keyof typeof TIER_CONFIG>

interface Props {
    coach: CoachListItem
    open: boolean
    onClose: () => void
}

type Tab = 'info' | 'edit' | 'acciones'

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">{children}</p>
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5 border-b border-subtle last:border-0">
            <span className="text-xs text-muted shrink-0">{label}</span>
            <span className={`text-right text-xs text-strong ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
        </div>
    )
}

function ActionButton({
    label, tooltip, onClick, loading, variant = 'default', icon: Icon
}: {
    label: string
    tooltip: string
    onClick: () => void
    loading?: boolean
    variant?: 'default' | 'danger' | 'success'
    icon: React.ElementType
}) {
    const colors = {
        default: 'border-subtle bg-surface-sunken text-strong hover:border-[var(--sport-500)] hover:text-[var(--sport-500)]',
        danger:  'border-[var(--danger-500)]/30 bg-[var(--danger-500)]/5 text-[var(--danger-500)] hover:bg-[var(--danger-500)]/15',
        success: 'border-[var(--success-500)]/30 bg-[var(--success-500)]/5 text-[var(--success-500)] hover:bg-[var(--success-500)]/15',
    }
    return (
        <div className="flex items-start gap-2">
            <button
                onClick={onClick}
                disabled={loading}
                className={`flex flex-1 items-center gap-2 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${colors[variant]}`}
            >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {loading ? 'Procesando...' : label}
            </button>
            <InfoTooltip content={tooltip} />
        </div>
    )
}

export function CoachCommandPanel({ coach, open, onClose }: Props) {
    const router = useRouter()
    const [tab, setTab] = useState<Tab>('info')
    const [pending, startTransition] = useTransition()
    const [loadingAction, setLoadingAction] = useState<string | null>(null)
    const [editError, setEditError] = useState('')
    const [copied, setCopied] = useState(false)
    const [confirm, setConfirm] = useState<string | null>(null)
    // El borrado sale del dialogo inline: es lo unico irreversible aqui y necesita
    // tipear el slug para habilitarse (AdminConfirmDialog + requireText).
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [events, setEvents] = useState<SubscriptionEventRow[] | null>(null)
    const [loadingEvents, setLoadingEvents] = useState(false)
    const [editTier, setEditTier] = useState(coach.subscription_tier ?? 'free')
    const [editMaxClients, setEditMaxClients] = useState(coach.max_clients ?? 10)
    const [editColorHex, setEditColorHex] = useState((coach as any).primary_color ?? '#10B981')
    const [modules, setModules] = useState<Record<string, boolean> | null>(null)

    useEffect(() => {
        setEditTier(coach.subscription_tier ?? 'free')
        setEditMaxClients(coach.max_clients ?? 10)
        setEditColorHex((coach as any).primary_color ?? '#10B981')
        // El historial solo se cargaba al CAMBIAR de tab, pero el tab inicial ya es Info —
        // habia que salir y volver para verlo (ROTO-6, F0 08-05). Ahora carga al abrir.
        setEvents(null)
        setLoadingEvents(true)
        void getCoachSubscriptionEvents(coach.id).then(data => {
            setEvents(data)
            setLoadingEvents(false)
        })
        // Modulos del coach para el bloque de override del tab Editar (ROTO-9).
        setModules(null)
        void getCoachModulesAction(coach.id).then(setModules)
    }, [coach.id])

    function refresh() {
        router.refresh()
        onClose()
    }

    async function loadEvents() {
        if (events !== null) return
        setLoadingEvents(true)
        const data = await getCoachSubscriptionEvents(coach.id)
        setEvents(data)
        setLoadingEvents(false)
    }

    function handleTabChange(t: Tab) {
        setTab(t)
        if (t === 'info') void loadEvents()
    }

    async function sendEmail(templateType: 'trial_warning' | 'trial_expired') {
        setLoadingAction(`email-${templateType}`)
        const res = await sendIndividualCoachEmailAction(coach.id, templateType)
        setLoadingAction(null)
        if (res.success) toast.success('Email enviado')
        else toast.error(res.error ?? 'No se pudo enviar el email')
    }

    function copyMpId() {
        const mpId = (coach as any).subscription_mp_id
        if (mpId) {
            navigator.clipboard.writeText(mpId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // El alert() nativo bloqueaba el hilo y no distinguia exito de "no paso nada":
    // ahora todo resultado (ok o error) llega por toast.
    async function runAction(
        key: string,
        fn: () => Promise<{ success?: boolean; error?: string }>,
        successMsg: string
    ) {
        setLoadingAction(key)
        const res = await fn()
        setLoadingAction(null)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success(successMsg)
        refresh()
    }

    async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setEditError('')
        const formData = new FormData(e.currentTarget)
        formData.append('coachId', coach.id)
        const res = await updateCoachAction(undefined, formData)
        if (res?.error) {
            setEditError(res.error)
            toast.error(res.error)
            return
        }
        toast.success('Cambios guardados')
        refresh()
    }

    const daysLeft = coach.days_until_expiry
    const expiryColor = daysLeft === null ? '' : daysLeft < 0 ? 'text-muted' : daysLeft < 7 ? 'text-[var(--danger-500)]' : daysLeft < 14 ? 'text-[var(--warning-500)]' : 'text-[var(--success-500)]'

    const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: 'info',     label: 'Info',     icon: Activity },
        { key: 'edit',     label: 'Editar',   icon: Edit3 },
        { key: 'acciones', label: 'Acciones', icon: Zap },
    ]

    return (
        <Sheet open={open} onOpenChange={o => !o && onClose()}>
            <SheetContent
                className="w-full sm:max-w-xl flex flex-col gap-0 p-0 border-subtle bg-surface-card text-strong"
            >
                {/* Header */}
                <SheetHeader className="border-b border-subtle px-5 py-4">
                    <SheetTitle className="text-base font-semibold text-strong">
                        {coach.brand_name || coach.full_name || 'Coach'}
                    </SheetTitle>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {coach.subscription_status && <AdminStatusBadge value={coach.subscription_status} />}
                        {coach.subscription_tier && <AdminStatusBadge value={coach.subscription_tier} type="tier" />}
                        {coach.payment_provider && <AdminStatusBadge value={coach.payment_provider} type="provider" />}
                        <a
                            href={`/c/${coach.slug}/login`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto flex items-center gap-1 text-[11px] text-[var(--sport-500)] hover:underline"
                        >
                            Ver app <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                    {/* Salida del flujo rapido hacia la ficha completa del coach. */}
                    <Link
                        href={`/admin/coaches/${coach.id}`}
                        onClick={onClose}
                        className="mt-2 flex w-fit items-center gap-1 text-[11px] font-medium text-[var(--sport-500)] hover:underline"
                    >
                        Ver ficha completa <ArrowRight className="h-3 w-3" />
                    </Link>
                </SheetHeader>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-subtle px-4 pt-3 pb-0">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => handleTabChange(t.key)}
                            className={`flex items-center gap-1.5 rounded-t px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                                tab === t.key
                                    ? 'border-[var(--sport-500)] text-[var(--sport-500)]'
                                    : 'border-transparent text-muted hover:text-body'
                            }`}
                        >
                            <t.icon className="h-3.5 w-3.5" />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4">

                    {/* ── Tab Info ── */}
                    {tab === 'info' && (
                        <div className="space-y-5">
                            <div>
                                <SectionLabel>Identificación</SectionLabel>
                                <InfoRow label="Slug" value={`/c/${coach.slug}`} mono />
                                <InfoRow label="ID" value={<span className="font-mono text-[10px]">{coach.id}</span>} />
                                <InfoRow
                                    label="Email"
                                    value={
                                        coach.auth_email ? (
                                            <span className="flex items-center gap-1">
                                                <span className="font-mono text-[11px]">{coach.auth_email}</span>
                                                <button
                                                    onClick={() => { navigator.clipboard.writeText(coach.auth_email ?? '') }}
                                                    className="rounded p-0.5 hover:bg-surface-sunken transition-colors"
                                                    title="Copiar email"
                                                >
                                                    <Copy className="h-3 w-3 text-muted" />
                                                </button>
                                            </span>
                                        ) : '—'
                                    }
                                />
                                {coach.monthly_revenue > 0 && (
                                    <InfoRow label="MRR contrib." value={<span className="font-mono text-xs text-[var(--success-500)]">${coach.monthly_revenue.toLocaleString('es-CL')}/mes</span>} />
                                )}
                            </div>
                            <div>
                                <SectionLabel>Suscripción</SectionLabel>
                                <InfoRow label="Tier" value={<AdminStatusBadge value={coach.subscription_tier ?? ''} type="tier" />} />
                                <InfoRow label="Estado" value={<AdminStatusBadge value={coach.subscription_status ?? ''} />} />
                                <InfoRow label="Billing cycle" value={coach.billing_cycle} />
                                <InfoRow label="Provider" value={<AdminStatusBadge value={coach.payment_provider ?? ''} type="provider" />} />
                                <InfoRow
                                    label="Vence"
                                    value={
                                        coach.current_period_end ? (
                                            <span className={expiryColor}>
                                                {format(new Date(coach.current_period_end), "d MMM yyyy", { locale: es })}
                                                {daysLeft !== null && ` (${daysLeft < 0 ? 'hace ' + Math.abs(daysLeft) : daysLeft} días${daysLeft < 0 ? '' : ''})`}
                                            </span>
                                        ) : '—'
                                    }
                                />
                                <InfoRow
                                    label="Trial ends"
                                    value={coach.trial_ends_at
                                        ? format(new Date(coach.trial_ends_at), "d MMM yyyy", { locale: es })
                                        : '—'}
                                />
                            </div>
                            <div>
                                <SectionLabel>Uso</SectionLabel>
                                <InfoRow label="Alumnos" value={
                                    <span className="flex items-center gap-2">
                                        {coach.active_client_count} activos / {coach.client_count} total
                                        <a
                                            href={`/admin/clients?coachId=${coach.id}`}
                                            className="text-[10px] text-[var(--sport-500)] hover:underline"
                                        >
                                            Ver alumnos →
                                        </a>
                                    </span>
                                } />
                                <InfoRow label="Máximo" value={`${coach.max_clients} alumnos`} />
                                <InfoRow label="Utilización" value={`${coach.utilization_pct}%`} />
                                <InfoRow
                                    label="Última actividad"
                                    value={coach.last_activity_at
                                        ? format(new Date(coach.last_activity_at), "d MMM yyyy HH:mm", { locale: es })
                                        : 'Sin actividad'}
                                />
                            </div>
                            <div>
                                <SectionLabel>Links rápidos</SectionLabel>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href={`/c/${coach.slug}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 rounded border border-subtle bg-surface-sunken px-2.5 py-1.5 text-xs text-body hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors"
                                    >
                                        <ExternalLink className="h-3 w-3" /> App pública
                                    </a>
                                    <a
                                        href={`/admin/clients?coachId=${coach.id}`}
                                        className="flex items-center gap-1.5 rounded border border-subtle bg-surface-sunken px-2.5 py-1.5 text-xs text-body hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors"
                                    >
                                        Ver todos los alumnos ({coach.client_count})
                                    </a>
                                </div>
                            </div>
                            {(coach as any).subscription_mp_id && (
                                <div>
                                    <SectionLabel>MercadoPago</SectionLabel>
                                    <div className="flex items-center gap-2 rounded border border-subtle bg-surface-sunken px-3 py-2">
                                        <span className="flex-1 truncate font-mono text-[10px] text-muted">
                                            {(coach as any).subscription_mp_id}
                                        </span>
                                        <button onClick={copyMpId} className="text-muted hover:text-strong">
                                            {copied ? <CheckCircle className="h-3.5 w-3.5 text-[var(--success-500)]" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div>
                                <SectionLabel>Historial de suscripción</SectionLabel>
                                {loadingEvents && <p className="text-xs text-muted">Cargando...</p>}
                                {events !== null && events.length === 0 && (
                                    <p className="text-xs text-muted">Sin eventos registrados.</p>
                                )}
                                {events !== null && events.length > 0 && (
                                    <div className="space-y-2">
                                        {events.map((ev) => (
                                            <div key={ev.id} className="flex items-start gap-2 rounded border border-subtle bg-surface-sunken px-3 py-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-mono text-[10px] text-body">
                                                        {ev.provider_status ?? '—'}
                                                    </p>
                                                    <p className="truncate font-mono text-[9px] text-muted" title={ev.provider_event_id ?? ''}>
                                                        {ev.provider_event_id ?? '—'}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 font-mono text-[9px] text-muted">
                                                    {format(new Date(ev.created_at), 'dd/MM HH:mm', { locale: es })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Tab Editar ── */}
                    {tab === 'edit' && (
                        <form onSubmit={handleEdit} className="space-y-4">
                            {/* Identidad */}
                            <div>
                                <Label className="text-xs text-body">Nombre completo</Label>
                                <Input name="full_name" defaultValue={coach.full_name ?? ''} className="mt-1 border-subtle bg-surface-sunken text-strong" />
                            </div>
                            <div>
                                <Label className="text-xs text-body">Marca</Label>
                                <Input name="brand_name" defaultValue={coach.brand_name ?? ''} className="mt-1 border-subtle bg-surface-sunken text-strong" />
                            </div>

                            {/* Slug — read only */}
                            <div>
                                <Label className="text-xs text-body">Slug (URL)</Label>
                                <div className="mt-1 flex items-center gap-2 rounded-md border border-subtle bg-surface-app px-3 py-2">
                                    <span className="flex-1 font-mono text-xs text-muted">/c/{coach.slug}</span>
                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(coach.slug)}
                                        className="rounded p-0.5 hover:bg-surface-sunken transition-colors"
                                        title="Copiar slug"
                                    >
                                        <Copy className="h-3 w-3 text-muted" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted mt-0.5">Inmutable — cambiarlo rompe acceso de alumnos</p>
                            </div>

                            {/* Tier + Status */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-body">Tier</Label>
                                    <Select
                                        name="subscription_tier"
                                        value={editTier}
                                        onValueChange={v => {
                                            if (!v) return
                                            setEditTier(v)
                                            const cfg = TIER_CONFIG[v as keyof typeof TIER_CONFIG]
                                            if (cfg) setEditMaxClients(cfg.maxClients)
                                        }}
                                    >
                                        <SelectTrigger className="mt-1 border-subtle bg-surface-sunken text-strong">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-subtle bg-surface-sunken">
                                            {ALL_TIERS.map(v => {
                                                const cfg = TIER_CONFIG[v]
                                                return (
                                                    <SelectItem key={v} value={v}>
                                                        {v} <span className="text-muted">({cfg.maxClients} alumnos)</span>
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-body">Estado</Label>
                                    <Select name="subscription_status" defaultValue={coach.subscription_status ?? undefined}>
                                        <SelectTrigger className="mt-1 border-subtle bg-surface-sunken text-strong">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-subtle bg-surface-sunken">
                                            {['active','trialing','canceled','pending_payment','expired','past_due','paused'].map(v => (
                                                <SelectItem key={v} value={v}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Max alumnos + Ciclo */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-body">
                                        Max alumnos
                                        <span className="ml-1.5 font-normal text-muted">({coach.active_client_count} activos)</span>
                                    </Label>
                                    <Input
                                        name="max_clients"
                                        type="number"
                                        value={editMaxClients}
                                        onChange={e => setEditMaxClients(Number(e.target.value))}
                                        className="mt-1 border-subtle bg-surface-sunken text-strong"
                                    />
                                    {editMaxClients < coach.active_client_count && (
                                        <p className="text-[10px] text-[var(--warning-500)] mt-0.5">⚠ Límite menor que alumnos activos</p>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-xs text-body">Ciclo de facturación</Label>
                                    <Select name="billing_cycle" defaultValue={coach.billing_cycle ?? undefined}>
                                        <SelectTrigger className="mt-1 border-subtle bg-surface-sunken text-strong">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-subtle bg-surface-sunken">
                                            <SelectItem value="monthly">Mensual</SelectItem>
                                            <SelectItem value="quarterly">Trimestral</SelectItem>
                                            <SelectItem value="annual">Anual</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Provider */}
                            <div>
                                <Label className="text-xs text-body">Provider de pago</Label>
                                <Select name="payment_provider" defaultValue={coach.payment_provider ?? undefined}>
                                    <SelectTrigger className="mt-1 border-subtle bg-surface-sunken text-strong">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="border-subtle bg-surface-sunken">
                                        <SelectItem value="beta">Beta (prueba sin pago)</SelectItem>
                                        <SelectItem value="internal">Internal</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                        <SelectItem value="mercadopago">MercadoPago</SelectItem>
                                        <SelectItem value="stripe">Stripe</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Fechas */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-body">Vencimiento período</Label>
                                    <Input
                                        name="current_period_end"
                                        type="datetime-local"
                                        defaultValue={coach.current_period_end
                                            ? new Date(coach.current_period_end).toISOString().slice(0, 16)
                                            : ''}
                                        className="mt-1 border-subtle bg-surface-sunken text-strong"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-body">Fin del trial</Label>
                                    <Input
                                        name="trial_ends_at"
                                        type="datetime-local"
                                        defaultValue={coach.trial_ends_at
                                            ? new Date(coach.trial_ends_at).toISOString().slice(0, 16)
                                            : ''}
                                        className="mt-1 border-subtle bg-surface-sunken text-strong"
                                    />
                                </div>
                            </div>

                            {/* Color de marca */}
                            <div>
                                <Label className="text-xs text-body flex items-center gap-1.5">
                                    <Palette className="h-3 w-3" />
                                    Color de marca
                                </Label>
                                <div className="mt-1 flex items-center gap-3">
                                    <input
                                        type="color"
                                        name="primary_color"
                                        value={editColorHex}
                                        onChange={e => setEditColorHex(e.target.value)}
                                        className="h-8 w-8 cursor-pointer rounded border border-subtle bg-transparent p-0.5"
                                    />
                                    <span className="font-mono text-xs text-body">{editColorHex}</span>
                                </div>
                            </div>

                            {/* Modulos habilitados — el backend (updateCoachAction → syncAdminGrants) existia
                                completo pero su unico form (CoachEditSheet) era codigo muerto sin importar:
                                el CEO no tenia NINGUN punto de entrada para el override (ROTO-9, F0 08-05). */}
                            <div className="rounded-lg border border-subtle p-3">
                                <p className="text-xs font-medium text-body">Módulos habilitados</p>
                                <p className="mt-0.5 text-[10px] text-muted">Override del CEO — activa o desactiva módulos de pago para este coach (cortesía admin_grant).</p>
                                {modules === null ? (
                                    <p className="mt-2 text-xs text-muted">Cargando módulos...</p>
                                ) : (
                                    <>
                                        <input type="hidden" name="modules_present" value="1" />
                                        <div className="mt-2 grid grid-cols-1 gap-2">
                                            {MODULE_KEYS.map(key => (
                                                <label key={key} className="flex items-center gap-2 text-xs text-strong">
                                                    <input
                                                        type="checkbox"
                                                        name={`module_${key}`}
                                                        defaultChecked={modules[key] === true}
                                                        className="h-4 w-4 rounded border-subtle bg-surface-sunken"
                                                    />
                                                    {MODULE_LABELS[key]}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Notas */}
                            <div>
                                <Label className="text-xs text-body">Notas internas (admin)</Label>
                                <textarea
                                    name="admin_notes"
                                    defaultValue={(coach as any).admin_notes ?? ''}
                                    rows={3}
                                    placeholder="Notas privadas sobre este coach (no visibles para el coach)..."
                                    className="mt-1 w-full rounded-md border border-subtle bg-surface-sunken px-3 py-2 text-xs text-strong placeholder:text-muted focus:outline-none focus:border-[var(--sport-500)] resize-none"
                                />
                            </div>

                            {editError && <p className="text-xs text-[var(--danger-500)]">{editError}</p>}
                            <Button type="submit" className="w-full bg-[var(--cta-fill)] text-white hover:bg-[var(--sport-600)]">
                                Guardar cambios
                            </Button>
                        </form>
                    )}

                    {/* ── Tab Acciones ── */}
                    {tab === 'acciones' && (
                        <div className="space-y-6">
                            <div>
                                <SectionLabel>Extender período</SectionLabel>
                                <div className="flex gap-2">
                                    {([7, 14, 30] as const).map(d => (
                                        <button
                                            key={d}
                                            disabled={loadingAction === `extend-${d}`}
                                            onClick={() => runAction(`extend-${d}`, () => extendCoachPeriodAction(coach.id, d), `Período extendido +${d} días`)}
                                            className="flex-1 rounded border border-subtle bg-surface-sunken py-2 text-xs font-medium text-strong hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors disabled:opacity-50"
                                        >
                                            +{d}d
                                        </button>
                                    ))}
                                    <InfoTooltip content="Suma días al período actual del coach. No cancela ni crea suscripciones, solo mueve la fecha de vencimiento. Útil para dar tiempo extra sin procesar un pago." />
                                </div>
                            </div>

                            <div>
                                <SectionLabel>Estado de acceso</SectionLabel>
                                <div className="space-y-2">
                                    <ActionButton
                                        label="Reactivar (activo +30d)"
                                        tooltip="Cambia estado a 'active' y extiende el período 30 días. Usar para resolver un cobro fallido o dar cortesía después de un problema técnico."
                                        icon={RefreshCw}
                                        variant="success"
                                        loading={loadingAction === 'reactivate'}
                                        onClick={() => {
                                            setConfirm('reactivate')
                                        }}
                                    />
                                    <ActionButton
                                        label="Suspender"
                                        tooltip="Pausa el acceso del coach. Verán la pantalla de reactivación pero no podrán pagar (estado 'paused'). Usar para coaches con deuda o problema técnico."
                                        icon={Pause}
                                        loading={loadingAction === 'suspend'}
                                        onClick={() => setConfirm('suspend')}
                                    />
                                    <ActionButton
                                        label="Forzar expiración"
                                        tooltip="Cambia el estado a 'expired'. En su próxima visita el coach será redirigido a /reactivate para pagar. Ideal para terminar un período de prueba beta manualmente."
                                        icon={Clock}
                                        variant="danger"
                                        loading={loadingAction === 'expire'}
                                        onClick={() => setConfirm('expire')}
                                    />
                                </div>
                            </div>

                            <div>
                                <SectionLabel>Comunicaciones</SectionLabel>
                                <div className="space-y-2">
                                    <ActionButton
                                        label="Enviar aviso de vencimiento (trial)"
                                        tooltip="Envía el email de advertencia de trial a este coach con los días restantes y plan recomendado."
                                        icon={Mail}
                                        loading={loadingAction === 'email-trial_warning'}
                                        onClick={() => void sendEmail('trial_warning')}
                                    />
                                    <ActionButton
                                        label="Enviar recordatorio expirado"
                                        tooltip="Envía el email de trial expirado con invitación a reactivar."
                                        icon={Mail}
                                        loading={loadingAction === 'email-trial_expired'}
                                        onClick={() => void sendEmail('trial_expired')}
                                    />
                                </div>
                            </div>

                            <div>
                                <SectionLabel>Zona de peligro</SectionLabel>
                                <ActionButton
                                    label="Eliminar coach permanentemente"
                                    tooltip="IRREVERSIBLE. Borra el usuario de Supabase Auth y todos sus datos. Los alumnos del coach quedan sin coach asignado. Solo usar si es absolutamente necesario."
                                    icon={ShieldOff}
                                    variant="danger"
                                    loading={loadingAction === 'delete'}
                                    onClick={() => setConfirmDelete(true)}
                                />
                            </div>

                            {/* Inline confirmation (expire / suspend / reactivate — reversibles) */}
                            {confirm && (
                                <div className="rounded-lg border border-[var(--warning-500)]/40 bg-[var(--warning-500)]/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="h-4 w-4 text-[var(--warning-500)]" />
                                        <p className="text-sm font-medium text-[var(--warning-500)]">
                                            {confirm === 'expire' ? '¿Forzar expiración del trial?' :
                                             confirm === 'suspend' ? '¿Suspender acceso?' :
                                             '¿Reactivar coach?'}
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted mb-3">
                                        {confirm === 'expire' ? 'El coach verá /reactivate en su próxima visita y deberá pagar para continuar.' :
                                         confirm === 'suspend' ? 'El coach perderá acceso inmediatamente.' :
                                         'El coach recuperará acceso por 30 días adicionales.'}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={async () => {
                                                const key = confirm
                                                setConfirm(null)
                                                if (key === 'expire') await runAction('expire', () => expireCoachAction(coach.id), 'Coach expirado')
                                                else if (key === 'suspend') await runAction('suspend', () => suspendCoachAction(coach.id), 'Coach suspendido')
                                                else if (key === 'reactivate') await runAction('reactivate', () => reactivateCoachAdminAction(coach.id), 'Coach reactivado (+30 días)')
                                            }}
                                            className="flex-1 rounded bg-[var(--danger-500)] py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                                        >
                                            Confirmar
                                        </button>
                                        <button
                                            onClick={() => setConfirm(null)}
                                            className="flex-1 rounded border border-subtle bg-surface-sunken py-1.5 text-xs text-body hover:text-strong transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Dentro del SheetContent a proposito: asi el focus-trap del Sheet cede
                    al del AlertDialog y el input de "escribe el slug" es tipeable. */}
                <AdminConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title="¿Eliminar coach permanentemente?"
                    description={`Vas a eliminar a ${coach.brand_name || coach.full_name || coach.slug}.`}
                    blastRadius={`Borra el usuario y todos sus datos, incluidos ${coach.client_count} alumno${coach.client_count !== 1 ? 's' : ''}. Irreversible.`}
                    severity="danger"
                    confirmLabel="Eliminar coach"
                    requireText={coach.slug}
                    onConfirm={() => runAction('delete', () => deleteCoachAction(coach.id), 'Coach eliminado')}
                />
            </SheetContent>
        </Sheet>
    )
}
