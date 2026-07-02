'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    IdCard,
    MessageCircle,
    UserPen,
    KeyRound,
    PlayCircle,
    PauseCircle,
    Archive,
    ArchiveRestore,
    Trash2,
    Check,
    Copy,
    type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    archiveClientAction,
    unarchiveClientAction,
    deleteClientAction,
    resetClientPasswordAction,
    toggleClientStatusAction,
} from './_actions/clients.actions'

type ConfirmKind = 'reset' | 'pause' | 'archive' | 'delete'

type ConfirmTone = 'danger' | 'warning' | 'info' | 'success' | 'sport'

const CONFIRM_TONES: Record<ConfirmTone, [string, string]> = {
    danger: ['var(--danger-100)', 'var(--danger-600)'],
    warning: ['var(--warning-100)', 'var(--warning-700)'],
    info: ['var(--info-100)', 'var(--info-600)'],
    success: ['var(--success-100)', 'var(--success-600)'],
    sport: ['var(--sport-100)', 'var(--sport-600)'],
}

function ConfirmBody({
    icon: Icon,
    tone,
    title,
    body,
    cta,
    danger,
    confirmName,
    pending,
    error,
    onCancel,
    onConfirm,
}: {
    icon: LucideIcon
    tone: ConfirmTone
    title: string
    body: string
    cta: string
    danger?: boolean
    confirmName?: string | null
    pending: boolean
    error?: string
    onCancel: () => void
    onConfirm: () => void
}) {
    const [typed, setTyped] = useState('')
    const [bg, fg] = CONFIRM_TONES[tone]
    const ok = !confirmName || typed.trim().toLowerCase() === confirmName.toLowerCase()
    return (
        <div className="px-6 pb-6 pt-1">
            <div
                className="mb-[13px] flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)]"
                style={{ background: bg, color: fg }}
            >
                <Icon className="h-[23px] w-[23px]" />
            </div>
            <div className="mb-1.5 font-display text-[19px] font-extrabold text-strong">{title}</div>
            <div className={cn('text-[13.5px] leading-normal text-muted', confirmName ? 'mb-3' : 'mb-5')}>
                {body}
            </div>
            {confirmName && (
                <div className="mb-5">
                    <div className="mb-1.5 text-xs text-muted">
                        Escribí <strong className="text-strong">{confirmName}</strong> para confirmar:
                    </div>
                    <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder={confirmName}
                        className={cn(
                            'w-full rounded-[var(--radius-md)] border-[1.5px] bg-surface-card px-[13px] py-[11px] font-ui text-[14.5px] text-strong outline-none placeholder:text-subtle',
                            ok ? 'border-[var(--danger-500)]' : 'border-default'
                        )}
                    />
                </div>
            )}
            {error && <p className="mb-3 text-sm font-semibold text-[var(--danger-600)]">{error}</p>}
            <div className="flex gap-2.5">
                <Button variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
                    Cancelar
                </Button>
                <Button
                    variant={danger ? 'danger' : 'sport'}
                    size="lg"
                    className="flex-1"
                    disabled={!ok || pending}
                    onClick={onConfirm}
                >
                    {pending ? 'Guardando…' : cta}
                </Button>
            </div>
        </div>
    )
}

interface ClientActionsSheetProps {
    client: any
    loginUrl: string
    onClose: () => void
    onEdit: (c: { id: string; name: string }) => void
}

export function ClientActionsSheet({ client, loginUrl, onClose, onEdit }: ClientActionsSheetProps) {
    const router = useRouter()
    const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
    const [tempPassword, setTempPassword] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    const name: string = client.full_name ?? ''
    const initials = name
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
    const paused = client.is_active === false
    const archived = client.is_archived === true

    const waMessage = `Hola ${name}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${loginUrl}`
    const whatsappLink =
        client.phone && loginUrl
            ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
            : null

    const run = (fn: () => Promise<{ error?: string }>, close = true) => {
        setError(undefined)
        startTransition(async () => {
            const result = await fn()
            if (result.error) setError(result.error)
            else if (close) onClose()
        })
    }

    const runReset = () => {
        setError(undefined)
        startTransition(async () => {
            const result = await resetClientPasswordAction(client.id)
            if (result.error) setError(result.error)
            else if (result.tempPassword) setTempPassword(result.tempPassword)
        })
    }

    const copyTemp = () => {
        if (!tempPassword) return
        navigator.clipboard.writeText(tempPassword)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
    }

    const actions: {
        icon: LucideIcon
        label: string
        tone: string
        danger?: boolean
        on: () => void
    }[] = [
        {
            icon: IdCard,
            label: 'Ver ficha completa',
            tone: 'var(--text-strong)',
            on: () => {
                onClose()
                router.push(`/coach/clients/${client.id}`)
            },
        },
        ...(whatsappLink
            ? [
                  {
                      icon: MessageCircle,
                      label: 'Enviar WhatsApp',
                      tone: 'var(--success-600)',
                      on: () => {
                          window.open(whatsappLink, '_blank', 'noopener,noreferrer')
                          onClose()
                      },
                  },
              ]
            : []),
        {
            icon: UserPen,
            label: 'Editar datos',
            tone: 'var(--text-strong)',
            on: () => {
                onClose()
                onEdit({ id: client.id, name })
            },
        },
        {
            icon: KeyRound,
            label: 'Resetear contraseña',
            tone: 'var(--info-600)',
            on: () => setConfirm('reset'),
        },
        {
            icon: paused ? PlayCircle : PauseCircle,
            label: paused ? 'Reactivar acceso' : 'Pausar acceso',
            tone: 'var(--warning-600)',
            on: () => setConfirm('pause'),
        },
        {
            icon: archived ? ArchiveRestore : Archive,
            label: archived ? 'Desarchivar' : 'Archivar alumno',
            tone: 'var(--ink-600)',
            on: () => setConfirm('archive'),
        },
        {
            icon: Trash2,
            label: 'Eliminar alumno',
            tone: 'var(--danger-600)',
            danger: true,
            on: () => setConfirm('delete'),
        },
    ]

    let content: React.ReactNode
    if (confirm === 'reset') {
        content = tempPassword ? (
            <div className="px-6 pb-6 pt-1 text-center">
                <div className="mb-3 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
                    <Check className="h-[26px] w-[26px]" />
                </div>
                <div className="font-display text-lg font-extrabold text-strong">Clave temporal lista</div>
                <div className="mb-3.5 mt-1 text-[13px] text-muted">
                    Compartila con {name.split(' ')[0]}. Deberá cambiarla al ingresar.
                </div>
                <button
                    type="button"
                    onClick={copyTemp}
                    className="mb-4 inline-flex items-center gap-2.5 rounded-[var(--radius-md)] border-[1.5px] border-default bg-surface-sunken px-[18px] py-3 font-mono text-[17px] font-bold text-strong"
                >
                    {tempPassword}
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <Button variant="sport" size="lg" className="w-full" onClick={onClose}>
                    Listo
                </Button>
            </div>
        ) : (
            <ConfirmBody
                icon={KeyRound}
                tone="info"
                title="Resetear contraseña"
                body={`Se generará una nueva clave temporal para ${name.split(' ')[0]}. Deberá cambiarla al ingresar. La clave anterior deja de funcionar.`}
                cta="Generar nueva clave"
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={runReset}
            />
        )
    } else if (confirm === 'pause') {
        content = paused ? (
            <ConfirmBody
                icon={PlayCircle}
                tone="success"
                title="Reactivar acceso"
                body="Volverá a tener acceso completo a la plataforma."
                cta="Reactivar"
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={() => run(() => toggleClientStatusAction(client.id, true))}
            />
        ) : (
            <ConfirmBody
                icon={PauseCircle}
                tone="warning"
                title="Pausar acceso"
                body="No podrá ver sus rutinas ni registrar datos, pero su historial se mantiene intacto. No libera cupo de tu plan."
                cta="Pausar"
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={() => run(() => toggleClientStatusAction(client.id, false))}
            />
        )
    } else if (confirm === 'archive') {
        content = archived ? (
            <ConfirmBody
                icon={ArchiveRestore}
                tone="sport"
                title="Desarchivar alumno"
                body="Vuelve a tu lista activa y cuenta para el cupo de tu plan."
                cta="Desarchivar"
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={() => run(() => unarchiveClientAction(client.id))}
            />
        ) : (
            <ConfirmBody
                icon={Archive}
                tone="warning"
                title="Archivar alumno"
                body="Se oculta de la lista y libera cupo de tu plan. No se borra nada: podés desarchivarlo cuando quieras."
                cta="Archivar"
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={() => run(() => archiveClientAction(client.id))}
            />
        )
    } else if (confirm === 'delete') {
        content = (
            <ConfirmBody
                icon={Trash2}
                tone="danger"
                title="Eliminar alumno"
                body="Esta acción eliminará su cuenta y todos sus datos asociados (rutinas, check-ins, progreso). No se puede deshacer."
                cta="Eliminar definitivamente"
                danger
                confirmName={name}
                pending={isPending}
                error={error}
                onCancel={() => setConfirm(null)}
                onConfirm={() => run(() => deleteClientAction(client.id))}
            />
        )
    } else {
        content = (
            <>
                <SheetHeader className="flex-row items-center gap-3 border-0 bg-surface-card px-6 pb-3 pt-2">
                    <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-[15px] font-extrabold text-sport-400">
                        {initials}
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-[15.5px] font-bold text-strong">{name}</div>
                        {client.email && (
                            <div className="truncate text-[12.5px] text-muted">{client.email}</div>
                        )}
                    </div>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto border-t border-subtle px-4 pb-4 pt-1">
                    {actions.map((a) => {
                        const Icon = a.icon
                        return (
                            <button
                                key={a.label}
                                type="button"
                                onClick={a.on}
                                className="eva-press flex min-h-[48px] w-full items-center gap-3 rounded-control px-2 py-3 text-left"
                            >
                                <span className="inline-flex shrink-0" style={{ color: a.tone }}>
                                    <Icon className="h-[19px] w-[19px]" />
                                </span>
                                <span
                                    className={cn(
                                        'text-[14.5px] font-semibold',
                                        a.danger ? 'text-[var(--danger-600)]' : 'text-strong'
                                    )}
                                >
                                    {a.label}
                                </span>
                            </button>
                        )
                    })}
                    {error && !confirm && (
                        <p className="px-2 pt-1 text-sm font-semibold text-[var(--danger-600)]">{error}</p>
                    )}
                </div>
            </>
        )
    }

    return (
        <Sheet open onOpenChange={(o) => !o && onClose()}>
            <SheetContent
                side="bottom"
                showCloseButton
                aria-label={`Acciones de ${name}`}
                className="max-h-[min(88dvh,620px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
            >
                {content}
            </SheetContent>
        </Sheet>
    )
}
