'use client'

import { useEffect, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react'
import {
    MoreVertical, UserPlus, UserMinus, Loader2, ShieldCheck, ShieldOff, ArrowLeftRight, Trash2,
    Pencil, Copy, Check, CheckCircle2, Crown, User, Mail, Tag,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
    createTeamCoachAction, addExistingCoachAction, removeTeamMemberAction,
    setTeamMemberManageAction, transferTeamOwnershipAction, updateTeamMemberRoleAction,
} from '../_actions/team.actions'
import type { TeamMemberView } from '../_data/team.queries'

function initialsOf(name: string): string {
    return name.split(' ').map((s) => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}

/** matchMedia md-up (breakpoint DS = 760px, mismo split que page.tsx): desktop → Dialog centrado, móvil → bottom-sheet. */
function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 760px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}
function useIsTeamDesktop() {
    return useSyncExternalStore(
        subscribeMd,
        () => window.matchMedia('(min-width: 760px)').matches,
        () => true,
    )
}

type Props = {
    teamId: string
    ownerCoachId: string
    userId: string
    isManager: boolean
    isOwner: boolean
    seatLimit: number
    activeMemberCount: number
    members: TeamMemberView[]
}

type Feedback = { type: 'error' | 'success'; msg: string } | null

export default function TeamMembersManager({
    teamId, ownerCoachId, userId, isManager, isOwner, seatLimit, activeMemberCount, members,
}: Props) {
    const [pending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<Feedback>(null)

    const [addOpen, setAddOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<TeamMemberView | null>(null)
    const [removeTarget, setRemoveTarget] = useState<TeamMemberView | null>(null)
    const [transferTarget, setTransferTarget] = useState<TeamMemberView | null>(null)

    const seatsFull = activeMemberCount >= seatLimit
    const run = (fn: () => Promise<{ error?: string; success?: boolean } | undefined | void>, okMsg: string, onOk?: () => void) =>
        startTransition(async () => {
            const res = await fn()
            if (res && 'error' in res && res.error) { setFeedback({ type: 'error', msg: res.error }); return }
            setFeedback({ type: 'success', msg: okMsg })
            onOk?.()
        })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-bold tracking-tight text-strong">Miembros ({activeMemberCount})</h3>
                {isManager && (
                    <Button size="sm" disabled={seatsFull || pending} onClick={() => { setFeedback(null); setAddOpen(true) }}>
                        <UserPlus className="h-4 w-4" /> Agregar coach
                    </Button>
                )}
            </div>

            {seatsFull && isManager && (
                <div className="rounded-control bg-[var(--warning-100)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--warning-700)]">
                    Llegaste al límite de {seatLimit} cupos. Pide al administrador ampliar el equipo para sumar más coaches.
                </div>
            )}

            {feedback && (
                <div className={cn(
                    'flex items-center gap-2 rounded-control px-3.5 py-2.5 text-[13px] font-bold',
                    feedback.type === 'error'
                        ? 'bg-[var(--danger-100)] text-[var(--danger-600)]'
                        : 'bg-[var(--success-100)] text-[var(--success-700)]'
                )}>
                    {feedback.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {feedback.msg}
                </div>
            )}

            <ul className="flex flex-col divide-y divide-subtle">
                {members.map((m) => {
                    const isMemberOwner = m.coach_id === ownerCoachId
                    const isSelf = m.coach_id === userId
                    const showMenu = isManager && !isMemberOwner
                    return (
                        <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar size="default"><AvatarFallback>{initialsOf(m.name)}</AvatarFallback></Avatar>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate font-semibold text-strong">
                                        {m.name}
                                        {isSelf && <span className="font-normal text-muted"> (tú)</span>}
                                    </span>
                                    <span className="truncate text-xs text-muted">{m.display_role || 'Coach'}</span>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {/* Tono de rol — espejo VERBATIM del kit (Owner=sport, Co-gestor=aqua, Miembro=neutral). */}
                                {isMemberOwner ? (
                                    <Badge tone="sport" variant="soft" size="sm">Owner</Badge>
                                ) : m.can_manage ? (
                                    <Badge tone="aqua" variant="soft" size="sm">Co-gestor</Badge>
                                ) : (
                                    <Badge tone="neutral" variant="soft" size="sm">Miembro</Badge>
                                )}
                                {showMenu && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger
                                            disabled={pending}
                                            aria-label="Acciones del miembro"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface-sunken hover:text-strong disabled:opacity-50"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => { setFeedback(null); setEditTarget(m) }}>
                                                <Pencil className="h-4 w-4" /> Editar especialidad
                                            </DropdownMenuItem>
                                            {isOwner && (
                                                <DropdownMenuItem onClick={() => run(
                                                    () => setTeamMemberManageAction(teamId, m.id, !m.can_manage),
                                                    m.can_manage ? 'Co-gestor degradado' : 'Co-gestor asignado',
                                                )}>
                                                    {m.can_manage
                                                        ? <><ShieldOff className="h-4 w-4" /> Quitar co-gestor</>
                                                        : <><ShieldCheck className="h-4 w-4" /> Hacer co-gestor</>}
                                                </DropdownMenuItem>
                                            )}
                                            {isOwner && (
                                                <DropdownMenuItem onClick={() => { setFeedback(null); setTransferTarget(m) }}>
                                                    <ArrowLeftRight className="h-4 w-4" /> Transferir propiedad
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem variant="destructive" onClick={() => { setFeedback(null); setRemoveTarget(m) }}>
                                                <Trash2 className="h-4 w-4" /> Sacar del equipo
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ul>

            {isManager && (
                <AddCoachDialog teamId={teamId} isOwner={isOwner} open={addOpen} onOpenChange={setAddOpen} />
            )}

            <EditRoleDialog
                member={editTarget} pending={pending} onOpenChange={(o) => !o && setEditTarget(null)}
                onSave={(role) => run(
                    () => updateTeamMemberRoleAction(teamId, editTarget!.id, role),
                    'Especialidad actualizada', () => setEditTarget(null),
                )}
            />

            <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="size-11 rounded-full bg-[var(--danger-100)] text-[var(--danger-600)]">
                            <UserMinus />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Sacar a {removeTarget?.name} del equipo</AlertDialogTitle>
                        <AlertDialogDescription>
                            Pierde acceso al pool. Los alumnos siguen en el equipo y los ve el resto. Reversible: lo puedes volver a agregar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="danger"
                            disabled={pending}
                            onClick={() => run(() => removeTeamMemberAction(teamId, removeTarget!.id), 'Coach removido', () => setRemoveTarget(null))}>
                            Sacar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="size-11 rounded-full bg-[var(--sport-100)] text-[var(--sport-600)]">
                            <Crown />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Transferir propiedad a {transferTarget?.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {transferTarget?.name} pasa a ser owner del equipo (controla cupos, co-gestores y propiedad). Tú quedas como co-gestor. No se puede deshacer salvo que el nuevo owner te la devuelva.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={pending}
                            onClick={() => run(() => transferTeamOwnershipAction(teamId, transferTarget!.coach_id), 'Propiedad transferida', () => setTransferTarget(null))}>
                            Transferir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

export function AddCoachDialog({ teamId, isOwner, open, onOpenChange }: {
    teamId: string
    isOwner: boolean
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const isDesktop = useIsTeamDesktop()
    const [pending, startTransition] = useTransition()
    const [mode, setMode] = useState<'new' | 'existing'>('new')
    const [error, setError] = useState<string | null>(null)
    const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const [coManager, setCoManager] = useState(false)

    const reset = () => { setMode('new'); setError(null); setCreated(null); setCopied(false); setCoManager(false) }

    const handleNew = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setError(null)
        startTransition(async () => {
            const res = await createTeamCoachAction(teamId, fd)
            if (res?.error) { setError(res.error); return }
            if (res?.success) setCreated({ email: res.email, tempPassword: res.tempPassword })
        })
    }

    const handleExisting = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setError(null)
        startTransition(async () => {
            const res = await addExistingCoachAction(teamId, fd)
            if (res?.error) { setError(res.error); return }
            onOpenChange(false); reset()
        })
    }

    const copyPass = () => {
        if (!created) return
        navigator.clipboard?.writeText(created.tempPassword).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }

    const body = created ? (
        <div className="space-y-4">
            <div className="text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
                    <Check className="h-7 w-7" />
                </div>
                <h3 className="font-display text-[19px] font-extrabold text-strong">Cuenta creada</h3>
                <p className="mt-1 text-[13.5px] text-muted">Comparte estas credenciales. Cambiará la contraseña al primer ingreso.</p>
            </div>
            <div className="rounded-control bg-surface-sunken p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-muted">Email</span>
                    <span className="truncate font-mono text-[13px] font-semibold text-strong">{created.email}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-muted">Contraseña temporal</span>
                    <button
                        type="button"
                        onClick={copyPass}
                        className="inline-flex items-center gap-1.5 font-mono text-[13px] font-bold text-[var(--sport-600)]"
                    >
                        {created.tempPassword} {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <Button variant="sport" size="lg" className="w-full" onClick={() => { onOpenChange(false); reset() }}>Listo</Button>
        </div>
    ) : (
        <div className="space-y-4">
            {/* Segmented control (surface-sunken pill) — kit teams-equipo.jsx:527-530 */}
            <div className="flex gap-0.5 rounded-control bg-surface-sunken p-[3px]">
                {([['new', 'Cuenta nueva'], ['existing', 'Coach existente']] as const).map(([v, l]) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => setMode(v)}
                        className={cn(
                            'h-[38px] flex-1 rounded-[11px] text-[13.5px] transition-colors',
                            mode === v ? 'bg-surface-card font-bold text-strong shadow-sm' : 'font-semibold text-muted'
                        )}
                    >
                        {l}
                    </button>
                ))}
            </div>

            {error && (
                <div className="rounded-control bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">{error}</div>
            )}

            {mode === 'new' ? (
                <form onSubmit={handleNew} className="space-y-3.5">
                    <Input name="full_name" required minLength={2} maxLength={120} label="Nombre completo" iconLeft={<User />} placeholder="Nombre y apellido" />
                    <Input name="email" type="email" required label="Email" iconLeft={<Mail />} placeholder="coach@email.com" />
                    <Input name="display_role" maxLength={60} label="Especialidad (opcional)" iconLeft={<Tag />} placeholder="Ej. Fuerza, Nutrición…" />
                    {isOwner && (
                        <>
                            <input type="hidden" name="can_manage" value={coManager ? 'true' : 'false'} />
                            <button
                                type="button"
                                onClick={() => setCoManager((v) => !v)}
                                className="flex w-full items-center gap-2.5 rounded-sm bg-surface-sunken px-3 py-2.5 text-left"
                            >
                                <span className={cn(
                                    'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]',
                                    coManager ? 'bg-sport-500 text-white' : 'border-2 border-strong'
                                )}>
                                    {coManager && <Check className="h-3.5 w-3.5" />}
                                </span>
                                <span className="flex-1 text-[13.5px] font-semibold text-strong">Hacerlo co-gestor del equipo</span>
                            </button>
                        </>
                    )}
                    <Button type="submit" variant="sport" size="lg" className="w-full" disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear cuenta'}
                    </Button>
                </form>
            ) : (
                <form onSubmit={handleExisting} className="space-y-3.5">
                    <Input name="email" type="email" required label="Email del coach" iconLeft={<Mail />} placeholder="coach@email.com" />
                    <Input name="display_role" maxLength={60} label="Especialidad (opcional)" iconLeft={<Tag />} placeholder="Ej. Fuerza, Nutrición…" />
                    <p className="text-[12.5px] leading-relaxed text-muted">Suma por email a un coach que ya tiene cuenta en EVA. No puede pertenecer a una organización.</p>
                    <Button type="submit" variant="sport" size="lg" className="w-full" disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar al equipo'}
                    </Button>
                </form>
            )}
        </div>
    )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
                <DialogContent className="border-subtle bg-surface-card sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[20px] font-extrabold normal-case tracking-[-0.01em] text-strong">Agregar coach al equipo</DialogTitle>
                        <DialogDescription className="sr-only">Crea una cuenta nueva o suma un coach que ya tiene cuenta en EVA.</DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[88dvh] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
            >
                <div className="flex max-h-[88dvh] flex-col overflow-y-auto overscroll-contain px-5 pb-8 pt-3">
                    <div className="mx-auto mb-4 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="sr-only">Agregar coach</SheetTitle>
                        <SheetDescription className="sr-only">Crea una cuenta nueva o suma un coach que ya tiene cuenta en EVA.</SheetDescription>
                    </SheetHeader>
                    {!created && <h3 className="mb-3.5 font-display text-[20px] font-extrabold text-strong">Agregar coach</h3>}
                    {body}
                </div>
            </SheetContent>
        </Sheet>
    )
}

export function EditRoleDialog({ member, pending, onOpenChange, onSave }: {
    member: TeamMemberView | null
    pending: boolean
    onOpenChange: (o: boolean) => void
    onSave: (role: string) => void
}) {
    const isDesktop = useIsTeamDesktop()
    const [value, setValue] = useState('')
    useEffect(() => { if (member) setValue(member.display_role ?? '') }, [member])

    const body = (
        <form onSubmit={(e) => { e.preventDefault(); onSave(value.trim()) }} className="space-y-3.5">
            <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-sport-100 text-sport-600">
                    <Tag className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0">
                    <div className="font-display text-[18px] font-extrabold text-strong">Editar especialidad</div>
                    <div className="truncate text-[12.5px] text-muted">{member?.name}</div>
                </div>
            </div>
            <div>
                <label className="mb-1.5 block text-xs font-bold text-strong">
                    Especialidad <span className="font-normal text-subtle">· solo etiqueta, no cambia permisos</span>
                </label>
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    maxLength={60}
                    placeholder="Ej. Fuerza e hipertrofia"
                    autoFocus
                    className="h-[46px]"
                />
                <div className="mt-1 text-right text-[11px] text-subtle">{value.length}/60</div>
            </div>
            <div className="flex gap-2.5">
                <Button type="button" variant="ghost" size="lg" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
                <Button type="submit" variant="sport" size="lg" className="flex-1" disabled={pending}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Guardar</>}
                </Button>
            </div>
        </form>
    )

    if (isDesktop) {
        return (
            <Dialog open={!!member} onOpenChange={onOpenChange}>
                <DialogContent className="border-subtle bg-surface-card sm:max-w-[420px]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Editar especialidad</DialogTitle>
                        <DialogDescription>Etiqueta visible para el equipo. No cambia los permisos.</DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={!!member} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[88dvh] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
            >
                <div className="flex flex-col overflow-y-auto overscroll-contain px-5 pb-8 pt-3">
                    <div className="mx-auto mb-4 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                    <SheetHeader className="sr-only">
                        <SheetTitle>Editar especialidad</SheetTitle>
                        <SheetDescription>Etiqueta visible para el equipo. No cambia los permisos.</SheetDescription>
                    </SheetHeader>
                    {body}
                </div>
            </SheetContent>
        </Sheet>
    )
}
