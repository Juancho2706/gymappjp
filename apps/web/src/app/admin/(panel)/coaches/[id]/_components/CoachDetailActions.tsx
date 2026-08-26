'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Clock, Copy, Pause, RefreshCw, ShieldOff } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { AdminConfirmDialog } from '../../../_components/AdminConfirmDialog'
import {
    deleteCoachAction,
    expireCoachAction,
    extendCoachPeriodAction,
    reactivateCoachAdminAction,
    suspendCoachAction,
} from '../../_actions/coach-actions'

/** Resultado común de las server actions de coach (`{ success }` | `{ error }`). */
type ActionResult = { success?: boolean; error?: string }

interface Props {
    coachId: string
    /** Slug del coach: es el texto que hay que tipear para habilitar el borrado. */
    slug: string
    /** Alumnos totales del coach — alcance real del borrado. */
    clientCount: number
}

function ActionButton({
    label, tooltip, onClick, loading, variant = 'default', icon: Icon,
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
        danger: 'border-[var(--danger-500)]/30 bg-[var(--danger-500)]/5 text-[var(--danger-500)] hover:bg-[var(--danger-500)]/15',
        success: 'border-[var(--success-500)]/30 bg-[var(--success-500)]/5 text-[var(--success-500)] hover:bg-[var(--success-500)]/15',
    }
    return (
        <div className="flex items-start gap-2">
            <button
                type="button"
                onClick={onClick}
                disabled={loading}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] ${colors[variant]}`}
            >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {loading ? 'Procesando…' : label}
            </button>
            <InfoTooltip content={tooltip} />
        </div>
    )
}

/**
 * Botón de copiado reutilizable de la ficha (el header es Server Component y no puede llamar
 * a `navigator.clipboard`). Vive acá para no sumar un archivo cliente extra por un botón.
 */
export function CopyTextButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={() => {
                void navigator.clipboard.writeText(value)
                setCopied(true)
                toast.success('Copiado al portapapeles.')
                setTimeout(() => setCopied(false), 2000)
            }}
            className="rounded p-0.5 text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
        >
            {copied
                ? <Check className="h-3.5 w-3.5 text-[var(--success-500)]" />
                : <Copy className="h-3.5 w-3.5" />}
        </button>
    )
}

type ConfirmKey = 'reactivate' | 'suspend' | 'expire' | 'delete'

/**
 * Acciones de la ficha de coach. Toda mutación destructiva pasa por `AdminConfirmDialog` con la
 * consecuencia REAL escrita (expirar cancela la suscripción en la pasarela y ancla la gracia de
 * los alumnos; borrar arrastra alumnos y datos). Extender es reversible ⇒ va directo.
 */
export function CoachDetailActions({ coachId, slug, clientCount }: Props) {
    const router = useRouter()
    const [pending, setPending] = useState<string | null>(null)
    const [confirm, setConfirm] = useState<ConfirmKey | null>(null)

    async function run(key: string, fn: () => Promise<ActionResult>, okMsg: string, after?: () => void) {
        setPending(key)
        try {
            const res = await fn()
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success(okMsg)
            if (after) after()
            else router.refresh()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción.')
        } finally {
            setPending(null)
        }
    }

    const CONFIRMS: Record<ConfirmKey, {
        title: string
        description: string
        blastRadius?: string
        severity: 'danger' | 'warning'
        confirmLabel: string
        requireText?: string
        onConfirm: () => Promise<void>
    }> = {
        reactivate: {
            title: '¿Reactivar este coach?',
            description: 'Pasa la suscripción a "active", extiende el período 30 días y limpia el ancla de gracia de sus alumnos. No cobra nada ni crea una suscripción en la pasarela.',
            severity: 'warning',
            confirmLabel: 'Reactivar +30d',
            onConfirm: () => run('reactivate', () => reactivateCoachAdminAction(coachId), 'Coach reactivado por 30 días.'),
        },
        suspend: {
            title: '¿Suspender el acceso?',
            description: 'El coach pierde acceso de inmediato (estado "paused") y verá la pantalla de reactivación sin poder pagar. Ancla la gracia de sus alumnos: pasados 7 días quedan en solo lectura.',
            blastRadius: `Deja sin acceso al coach y con la gracia corriendo a sus ${clientCount} alumnos.`,
            severity: 'warning',
            confirmLabel: 'Suspender',
            onConfirm: () => run('suspend', () => suspendCoachAction(coachId), 'Coach suspendido.'),
        },
        expire: {
            title: '¿Forzar la expiración?',
            description: 'Pasa la suscripción a "expired" Y CANCELA la suscripción en la pasarela (MercadoPago o Flow): deja de cobrarse y no se puede reactivar con el id viejo. Además ancla la gracia de los alumnos, que quedan en solo lectura a los 7 días.',
            blastRadius: `Cancela el cobro en la pasarela y arranca la gracia de ${clientCount} alumnos.`,
            severity: 'danger',
            confirmLabel: 'Expirar y cancelar cobro',
            onConfirm: () => run('expire', () => expireCoachAction(coachId), 'Coach expirado y suscripción cancelada en la pasarela.'),
        },
        delete: {
            title: '¿Eliminar este coach para siempre?',
            description: 'Borra al coach de Supabase Auth y de la plataforma, junto con sus alumnos, planes de nutrición, alimentos y comidas guardadas. No hay deshacer ni respaldo automático.',
            // `clientCount` ya NO incluye al alumno de ejemplo (getCoachDetail filtra is_demo desde
            // W4 de «Vive tu app» directo): el demo se borra igual, así que se nombra aparte para
            // que el alcance declarado siga siendo el alcance real. Mismo copy que el confirm del
            // listado (`CoachCommandPanel`).
            blastRadius: `Borra el usuario y todos sus datos, incluidos ${clientCount} alumno${clientCount !== 1 ? 's reales' : ' real'} y su alumno de ejemplo. Irreversible.`,
            severity: 'danger',
            confirmLabel: 'Eliminar definitivamente',
            requireText: slug,
            onConfirm: () => run(
                'delete',
                () => deleteCoachAction(coachId),
                'Coach eliminado.',
                // Tras el borrado la ficha ya no existe: refrescar acá daría 404. Volvemos al listado.
                () => router.push('/admin/coaches'),
            ),
        },
    }

    const active = confirm ? CONFIRMS[confirm] : null

    return (
        <section className="rounded-card border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">Acciones</h2>
            <p className="mt-0.5 text-[11px] text-muted">
                Todo lo de acá queda registrado en la auditoría con tu email.
            </p>

            <div className="mt-4 space-y-5">
                <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">Extender período</p>
                    <div className="flex items-center gap-2">
                        {([7, 14, 30] as const).map((d) => (
                            <button
                                key={d}
                                type="button"
                                disabled={pending === `extend-${d}`}
                                onClick={() => void run(
                                    `extend-${d}`,
                                    () => extendCoachPeriodAction(coachId, d),
                                    `Período extendido ${d} días.`,
                                )}
                                className="flex-1 rounded-lg border border-subtle bg-surface-sunken py-2 text-xs font-medium text-strong transition-colors hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            >
                                {pending === `extend-${d}` ? '…' : `+${d}d`}
                            </button>
                        ))}
                        <InfoTooltip content="Suma días al vencimiento actual. No cancela ni crea suscripciones en la pasarela, solo mueve la fecha. Reversible." />
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">Estado de acceso</p>
                    <div className="space-y-2">
                        <ActionButton
                            label="Reactivar (activo +30d)"
                            tooltip="Estado 'active' + 30 días de período y limpia el ancla de gracia de los alumnos. Para resolver un cobro fallido o dar cortesía tras un problema técnico."
                            icon={RefreshCw}
                            variant="success"
                            loading={pending === 'reactivate'}
                            onClick={() => setConfirm('reactivate')}
                        />
                        <ActionButton
                            label="Suspender"
                            tooltip="Estado 'paused': el coach pierde acceso y no puede pagar. Para deuda o incidente."
                            icon={Pause}
                            loading={pending === 'suspend'}
                            onClick={() => setConfirm('suspend')}
                        />
                        <ActionButton
                            label="Forzar expiración"
                            tooltip="Estado 'expired' + CANCELA la suscripción en la pasarela y ancla la gracia de los alumnos. Para terminar una prueba o cortar el cobro."
                            icon={Clock}
                            variant="danger"
                            loading={pending === 'expire'}
                            onClick={() => setConfirm('expire')}
                        />
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">Zona de peligro</p>
                    <ActionButton
                        label="Eliminar coach permanentemente"
                        tooltip="IRREVERSIBLE. Borra el usuario de Auth, sus alumnos y todos sus datos."
                        icon={ShieldOff}
                        variant="danger"
                        loading={pending === 'delete'}
                        onClick={() => setConfirm('delete')}
                    />
                </div>
            </div>

            {active && (
                <AdminConfirmDialog
                    open
                    onOpenChange={(open) => { if (!open) setConfirm(null) }}
                    title={active.title}
                    description={active.description}
                    blastRadius={active.blastRadius}
                    severity={active.severity}
                    confirmLabel={active.confirmLabel}
                    requireText={active.requireText}
                    onConfirm={active.onConfirm}
                />
            )}
        </section>
    )
}
