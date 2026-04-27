'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import {
    extendCoachPeriodAction,
    suspendCoachAction,
    expireCoachAction,
    reactivateCoachAdminAction,
    updateCoachAction,
} from '../_actions/coach-actions'
import {
    ExternalLink, Copy, CheckCircle, AlertTriangle, Clock,
    RefreshCw, Pause, Zap, ShieldOff, Edit3, Activity
} from 'lucide-react'
import type { CoachListItem } from '../../dashboard/_data/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
    coach: CoachListItem
    open: boolean
    onClose: () => void
}

type Tab = 'info' | 'edit' | 'acciones'

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">{children}</p>
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5 border-b border-[--admin-border] last:border-0">
            <span className="text-xs text-[--admin-text-3] shrink-0">{label}</span>
            <span className={`text-right text-xs text-[--admin-text-1] ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
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
        default: 'border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1] hover:border-[--admin-accent] hover:text-[--admin-accent]',
        danger:  'border-[--admin-red]/30 bg-[--admin-red]/5 text-[--admin-red] hover:bg-[--admin-red]/15',
        success: 'border-[--admin-green]/30 bg-[--admin-green]/5 text-[--admin-green] hover:bg-[--admin-green]/15',
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

    function refresh() {
        router.refresh()
        onClose()
    }

    function copyMpId() {
        const mpId = (coach as any).subscription_mp_id
        if (mpId) {
            navigator.clipboard.writeText(mpId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    async function runAction(key: string, fn: () => Promise<{ success?: boolean; error?: string }>) {
        setLoadingAction(key)
        const res = await fn()
        setLoadingAction(null)
        if (res.error) alert(`Error: ${res.error}`)
        else refresh()
    }

    async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setEditError('')
        const formData = new FormData(e.currentTarget)
        formData.append('coachId', coach.id)
        const res = await updateCoachAction(undefined, formData)
        if (res?.error) setEditError(res.error)
        else refresh()
    }

    const daysLeft = coach.days_until_expiry
    const expiryColor = daysLeft === null ? '' : daysLeft < 0 ? 'text-[--admin-text-3]' : daysLeft < 7 ? 'text-[--admin-red]' : daysLeft < 14 ? 'text-[--admin-amber]' : 'text-[--admin-green]'

    const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: 'info',     label: 'Info',     icon: Activity },
        { key: 'edit',     label: 'Editar',   icon: Edit3 },
        { key: 'acciones', label: 'Acciones', icon: Zap },
    ]

    return (
        <Sheet open={open} onOpenChange={o => !o && onClose()}>
            <SheetContent
                className="w-full sm:max-w-xl flex flex-col gap-0 p-0 border-[--admin-border] bg-[--admin-bg-surface] text-[--admin-text-1]"
            >
                {/* Header */}
                <SheetHeader className="border-b border-[--admin-border] px-5 py-4">
                    <SheetTitle className="text-base font-semibold text-[--admin-text-1]">
                        {coach.brand_name || coach.full_name || 'Coach'}
                    </SheetTitle>
                    <div className="flex items-center gap-1.5 mt-1">
                        {coach.subscription_status && <AdminStatusBadge value={coach.subscription_status} />}
                        {coach.subscription_tier && <AdminStatusBadge value={coach.subscription_tier} type="tier" />}
                        {coach.payment_provider && <AdminStatusBadge value={coach.payment_provider} type="provider" />}
                        <a
                            href={`/c/${coach.slug}/login`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto flex items-center gap-1 text-[11px] text-[--admin-accent] hover:underline"
                        >
                            Ver app <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                </SheetHeader>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-[--admin-border] px-4 pt-3 pb-0">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-1.5 rounded-t px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                                tab === t.key
                                    ? 'border-[--admin-accent] text-[--admin-accent]'
                                    : 'border-transparent text-[--admin-text-3] hover:text-[--admin-text-2]'
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
                                <InfoRow label="Alumnos" value={`${coach.active_client_count} activos / ${coach.client_count} total`} />
                                <InfoRow label="Máximo" value={`${coach.max_clients} alumnos`} />
                                <InfoRow label="Utilización" value={`${coach.utilization_pct}%`} />
                                <InfoRow
                                    label="Última actividad"
                                    value={coach.last_activity_at
                                        ? format(new Date(coach.last_activity_at), "d MMM yyyy HH:mm", { locale: es })
                                        : 'Sin actividad'}
                                />
                            </div>
                            {(coach as any).subscription_mp_id && (
                                <div>
                                    <SectionLabel>MercadoPago</SectionLabel>
                                    <div className="flex items-center gap-2 rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-3 py-2">
                                        <span className="flex-1 truncate font-mono text-[10px] text-[--admin-text-3]">
                                            {(coach as any).subscription_mp_id}
                                        </span>
                                        <button onClick={copyMpId} className="text-[--admin-text-3] hover:text-[--admin-text-1]">
                                            {copied ? <CheckCircle className="h-3.5 w-3.5 text-[--admin-green]" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab Editar ── */}
                    {tab === 'edit' && (
                        <form onSubmit={handleEdit} className="space-y-4">
                            <div>
                                <Label className="text-xs text-[--admin-text-2]">Nombre completo</Label>
                                <Input name="full_name" defaultValue={coach.full_name ?? ''} className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]" />
                            </div>
                            <div>
                                <Label className="text-xs text-[--admin-text-2]">Marca</Label>
                                <Input name="brand_name" defaultValue={coach.brand_name ?? ''} className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Tier</Label>
                                    <Select name="subscription_tier" defaultValue={coach.subscription_tier ?? undefined}>
                                        <SelectTrigger className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-[--admin-border] bg-[--admin-bg-elevated]">
                                            {['starter', 'pro', 'elite', 'scale'].map(v => (
                                                <SelectItem key={v} value={v}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Estado</Label>
                                    <Select name="subscription_status" defaultValue={coach.subscription_status ?? undefined}>
                                        <SelectTrigger className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-[--admin-border] bg-[--admin-bg-elevated]">
                                            {['active','trialing','canceled','pending_payment','expired','past_due','paused'].map(v => (
                                                <SelectItem key={v} value={v}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Max alumnos</Label>
                                    <Input name="max_clients" type="number" defaultValue={coach.max_clients ?? 10} className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]" />
                                </div>
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Ciclo de facturación</Label>
                                    <Select name="billing_cycle" defaultValue={coach.billing_cycle ?? undefined}>
                                        <SelectTrigger className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-[--admin-border] bg-[--admin-bg-elevated]">
                                            <SelectItem value="monthly">Mensual</SelectItem>
                                            <SelectItem value="quarterly">Trimestral</SelectItem>
                                            <SelectItem value="yearly">Anual</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Vencimiento período</Label>
                                    <Input
                                        name="current_period_end"
                                        type="datetime-local"
                                        defaultValue={coach.current_period_end
                                            ? new Date(coach.current_period_end).toISOString().slice(0, 16)
                                            : ''}
                                        className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-[--admin-text-2]">Trial ends at</Label>
                                    <Input
                                        name="trial_ends_at"
                                        type="datetime-local"
                                        defaultValue={coach.trial_ends_at
                                            ? new Date(coach.trial_ends_at).toISOString().slice(0, 16)
                                            : ''}
                                        className="mt-1 border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-1]"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs text-[--admin-text-2]">Notas internas (admin)</Label>
                                <textarea
                                    name="admin_notes"
                                    defaultValue={(coach as any).admin_notes ?? ''}
                                    rows={3}
                                    placeholder="Notas privadas sobre este coach (no visibles para el coach)..."
                                    className="mt-1 w-full rounded-md border border-[--admin-border] bg-[--admin-bg-elevated] px-3 py-2 text-xs text-[--admin-text-1] placeholder:text-[--admin-text-3] focus:outline-none focus:border-[--admin-accent] resize-none"
                                />
                            </div>
                            {editError && <p className="text-xs text-[--admin-red]">{editError}</p>}
                            <Button type="submit" className="w-full bg-[--admin-accent] text-white hover:bg-[--admin-accent-dim]">
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
                                            onClick={() => runAction(`extend-${d}`, () => extendCoachPeriodAction(coach.id, d))}
                                            className="flex-1 rounded border border-[--admin-border] bg-[--admin-bg-elevated] py-2 text-xs font-medium text-[--admin-text-1] hover:border-[--admin-accent] hover:text-[--admin-accent] transition-colors disabled:opacity-50"
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
                                <SectionLabel>Zona de peligro</SectionLabel>
                                <ActionButton
                                    label="Eliminar coach permanentemente"
                                    tooltip="IRREVERSIBLE. Borra el usuario de Supabase Auth y todos sus datos. Los alumnos del coach quedan sin coach asignado. Solo usar si es absolutamente necesario."
                                    icon={ShieldOff}
                                    variant="danger"
                                    loading={loadingAction === 'delete'}
                                    onClick={() => setConfirm('delete')}
                                />
                            </div>

                            {/* Inline confirmation */}
                            {confirm && (
                                <div className="rounded-lg border border-[--admin-amber]/40 bg-[--admin-amber]/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="h-4 w-4 text-[--admin-amber]" />
                                        <p className="text-sm font-medium text-[--admin-amber]">
                                            {confirm === 'delete' ? '¿Eliminar este coach?' :
                                             confirm === 'expire' ? '¿Forzar expiración del trial?' :
                                             confirm === 'suspend' ? '¿Suspender acceso?' :
                                             '¿Reactivar coach?'}
                                        </p>
                                    </div>
                                    <p className="text-xs text-[--admin-text-3] mb-3">
                                        {confirm === 'delete' ? 'Esta acción es irreversible. Todos los datos del coach serán eliminados.' :
                                         confirm === 'expire' ? 'El coach verá /reactivate en su próxima visita y deberá pagar para continuar.' :
                                         confirm === 'suspend' ? 'El coach perderá acceso inmediatamente.' :
                                         'El coach recuperará acceso por 30 días adicionales.'}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={async () => {
                                                const key = confirm
                                                setConfirm(null)
                                                if (key === 'expire') await runAction('expire', () => expireCoachAction(coach.id))
                                                else if (key === 'suspend') await runAction('suspend', () => suspendCoachAction(coach.id))
                                                else if (key === 'reactivate') await runAction('reactivate', () => reactivateCoachAdminAction(coach.id))
                                            }}
                                            className="flex-1 rounded bg-[--admin-red] py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                                        >
                                            Confirmar
                                        </button>
                                        <button
                                            onClick={() => setConfirm(null)}
                                            className="flex-1 rounded border border-[--admin-border] bg-[--admin-bg-elevated] py-1.5 text-xs text-[--admin-text-2] hover:text-[--admin-text-1] transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
