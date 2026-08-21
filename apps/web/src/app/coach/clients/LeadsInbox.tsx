'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronDown,
    Inbox,
    Mail,
    MessageCircle,
    Share2,
    UserPlus,
    X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateClientModal } from './CreateClientModal'
import { waMeUrl } from '@/lib/contact/whatsapp'
import {
    dismissLeadAction,
    markLeadContactedAction,
    markLeadConvertedAction,
    type LeadActionResult,
} from './_actions/leads.actions'
import type { CoachLeadListItem } from './_data/leads.queries'
import { cn } from '@/lib/utils'

/**
 * Inbox «Solicitudes» — arriba del roster en /coach/clients.
 *
 * Existe porque el `/join/[código]` standalone dejó de dar de alta a nadie (decisión del owner,
 * 2026-08-21): ahora deja una SOLICITUD y el coach decide. Esta es la única superficie donde esas
 * solicitudes se ven y se cierran.
 *
 * Solo se monta si hay ≥1 lead pendiente (la page devuelve null si la lista viene vacía): el
 * caso normal de un coach es no tener solicitudes, y un bloque vacío permanente sobre el roster
 * sería ruido diario a cambio de nada.
 */

type InboxOverride = 'contacted' | 'hidden'

interface LeadsInboxProps {
    leads: CoachLeadListItem[]
    /** Marca con la que el coach se presenta en el WhatsApp pre-armado. */
    brandName: string
    /** `?solicitudes=1` (link del correo de aviso): abre la sección y la trae a la vista. */
    autoOpen?: boolean
}

export function LeadsInbox({ leads, brandName, autoOpen = false }: LeadsInboxProps) {
    const [open, setOpen] = useState(autoOpen)
    const [overrides, setOverrides] = useState<Record<string, InboxOverride>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [confirmingId, setConfirmingId] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [convertingLead, setConvertingLead] = useState<CoachLeadListItem | null>(null)
    const [, startTransition] = useTransition()
    const sectionRef = useRef<HTMLElement>(null)

    // El correo que le llega al coach apunta a `/coach/clients?solicitudes=1`. Sin este scroll el
    // link lo deja arriba de un roster largo sin señal de que la sección existe más abajo.
    useEffect(() => {
        if (!autoOpen) return
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [autoOpen])

    const visible = useMemo(
        () => leads.filter((lead) => overrides[lead.id] !== 'hidden'),
        [leads, overrides]
    )

    // La lista se vacía por acciones del propio coach (convertir/descartar todo). No se
    // desmonta la sección: dejarla con el estado de "listo" confirma que lo que hizo tuvo efecto.
    const pendingCount = visible.length

    function runAction(
        leadId: string,
        action: () => Promise<LeadActionResult>,
        onSuccess: InboxOverride
    ) {
        setBusyId(leadId)
        setErrors((prev) => {
            const next = { ...prev }
            delete next[leadId]
            return next
        })
        startTransition(async () => {
            const result = await action()
            setBusyId(null)
            if (result.error) {
                setErrors((prev) => ({ ...prev, [leadId]: result.error as string }))
                return
            }
            setOverrides((prev) => ({ ...prev, [leadId]: onSuccess }))
        })
    }

    return (
        <section
            ref={sectionRef}
            id="solicitudes"
            aria-labelledby="solicitudes-titulo"
            className="overflow-hidden rounded-card border border-subtle bg-surface-card shadow-[var(--shadow-xs)]"
        >
            <h2 id="solicitudes-titulo" className="sr-only">
                Solicitudes de alumnos
            </h2>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="solicitudes-lista"
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken"
            >
                <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                    style={{
                        backgroundColor:
                            'color-mix(in srgb, var(--theme-primary, var(--sport-500)) 14%, transparent)',
                        color: 'var(--theme-primary, var(--sport-600))',
                    }}
                >
                    <Inbox className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="font-display text-[16px] font-black tracking-[-0.02em] text-strong">
                            Solicitudes
                        </span>
                        {pendingCount > 0 ? (
                            <span
                                className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-pill px-1.5 text-[11px] font-bold text-white"
                                style={{ backgroundColor: 'var(--theme-primary, var(--sport-500))' }}
                            >
                                {pendingCount}
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                        {pendingCount > 0
                            ? 'Pidieron entrenar contigo desde tu link. Tú decides quién entra.'
                            : 'No te quedan solicitudes pendientes.'}
                    </span>
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className={cn(
                        'h-5 w-5 shrink-0 text-muted transition-transform duration-200',
                        open && 'rotate-180'
                    )}
                />
            </button>

            {open ? (
                <div id="solicitudes-lista" className="border-t border-subtle p-3 sm:p-4">
                    {pendingCount === 0 ? (
                        <p className="py-6 text-center text-sm text-muted">
                            Listo. No queda ninguna solicitud por revisar.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {visible.map((lead) => (
                                <LeadCard
                                    key={lead.id}
                                    lead={lead}
                                    brandName={brandName}
                                    contacted={overrides[lead.id] === 'contacted' || lead.status === 'contacted'}
                                    busy={busyId === lead.id}
                                    error={errors[lead.id]}
                                    confirming={confirmingId === lead.id}
                                    onAskConfirm={() => setConfirmingId(lead.id)}
                                    onCancelConfirm={() => setConfirmingId(null)}
                                    onConvert={() => setConvertingLead(lead)}
                                    onContacted={() =>
                                        runAction(lead.id, () => markLeadContactedAction(lead.id), 'contacted')
                                    }
                                    onDismiss={() => {
                                        setConfirmingId(null)
                                        runAction(lead.id, () => dismissLeadAction(lead.id), 'hidden')
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}

            {/* Montado POR solicitud (y con `key`): los campos del alta van con `defaultValue`, así
                que un modal persistente conservaría los datos del lead anterior. */}
            {convertingLead ? (
                <CreateClientModal
                    key={convertingLead.id}
                    open
                    onClose={() => setConvertingLead(null)}
                    initialValues={{
                        full_name: convertingLead.fullName,
                        email: convertingLead.email,
                        phone: convertingLead.phone,
                    }}
                    onCreated={(clientId) => {
                        const leadId = convertingLead.id
                        // Optimista: el alumno YA existe (el alta no se deshace), así que la
                        // solicitud sale del inbox aunque el cierre del lead falle. Si fallara,
                        // el error queda visible al recargar, no se pierde la fila.
                        setOverrides((prev) => ({ ...prev, [leadId]: 'hidden' }))
                        startTransition(async () => {
                            await markLeadConvertedAction(leadId, clientId)
                        })
                    }}
                />
            ) : null}
        </section>
    )
}

interface LeadCardProps {
    lead: CoachLeadListItem
    brandName: string
    contacted: boolean
    busy: boolean
    error?: string
    confirming: boolean
    onAskConfirm: () => void
    onCancelConfirm: () => void
    onConvert: () => void
    onContacted: () => void
    onDismiss: () => void
}

function LeadCard({
    lead,
    brandName,
    contacted,
    busy,
    error,
    confirming,
    onAskConfirm,
    onCancelConfirm,
    onConvert,
    onContacted,
    onDismiss,
}: LeadCardProps) {
    const waHref = waMeUrl(
        lead.phone,
        `Hola ${lead.fullName}, soy ${brandName}. Recibí tu solicitud para entrenar conmigo, ¿conversamos?`
    )
    const ago = relativeTime(lead.createdAt)

    return (
        <li className="rounded-card border border-subtle bg-surface-sunken p-3.5">
            <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15.5px] font-black tracking-tight text-strong">
                        {lead.fullName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{ago}</span>
                        {contacted ? (
                            <>
                                <span aria-hidden="true" className="text-[var(--border-strong)]">
                                    ·
                                </span>
                                <span className="rounded-pill bg-[var(--info-100)] px-1.5 py-px text-[10.5px] font-bold text-[var(--info-700)]">
                                    Contactado
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>
                {lead.referrerName ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-[var(--success-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--success-700)]">
                        <Share2 className="h-3 w-3" aria-hidden="true" />
                        <span className="max-w-[140px] truncate">por tarjeta de {lead.referrerName}</span>
                    </span>
                ) : null}
            </div>

            {lead.message ? (
                <p className="mt-2.5 rounded-[10px] border-l-2 border-[var(--border-strong)] bg-surface-card px-3 py-2 text-sm leading-snug text-body">
                    {lead.message}
                </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {waHref ? (
                    <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center gap-2 rounded-control bg-[#25D366] px-4 text-sm font-bold text-white transition hover:bg-[#1ebe5d] active:scale-[0.98]"
                    >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        WhatsApp
                    </a>
                ) : null}
                {lead.email ? (
                    <a
                        href={`mailto:${lead.email}`}
                        className="inline-flex h-11 max-w-full items-center gap-2 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-sm font-bold text-strong transition-colors hover:bg-surface-sunken"
                    >
                        <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{lead.email}</span>
                    </a>
                ) : null}
            </div>

            {error ? (
                <p role="alert" className="mt-2.5 text-xs font-semibold text-[var(--cta-danger)]">
                    {error}
                </p>
            ) : null}

            {confirming ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-card px-3 py-2.5">
                    <p className="min-w-0 flex-1 text-xs text-body">
                        ¿Descartar la solicitud de {lead.fullName}? Sale de esta lista.
                    </p>
                    <Button variant="danger" size="sm" className="h-11" onClick={onDismiss} disabled={busy}>
                        Sí, descartar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-11" onClick={onCancelConfirm} disabled={busy}>
                        Cancelar
                    </Button>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="sport" size="sm" className="h-11" onClick={onConvert} disabled={busy}>
                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                        Agregar como alumno
                    </Button>
                    {contacted ? null : (
                        <Button variant="secondary" size="sm" className="h-11" onClick={onContacted} disabled={busy}>
                            Marcar contactado
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 text-muted"
                        onClick={onAskConfirm}
                        disabled={busy}
                        aria-label={`Descartar la solicitud de ${lead.fullName}`}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Descartar
                    </Button>
                </div>
            )}
        </li>
    )
}

/** «hace 3 horas». Fecha inválida ⇒ cadena vacía, nunca «Invalid Date» en pantalla. */
function relativeTime(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return formatDistanceToNow(date, { addSuffix: true, locale: es })
}
