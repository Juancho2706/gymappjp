'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Crown, MoreVertical, UserPlus, Loader2, ShieldCheck, ShieldOff, ArrowLeftRight, Trash2, Pencil, Copy, Check } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    createTeamCoachAction, addExistingCoachAction, removeTeamMemberAction,
    setTeamMemberManageAction, transferTeamOwnershipAction, updateTeamMemberRoleAction,
} from '../_actions/team.actions'
import type { TeamMemberView } from '../_data/team.queries'

function initialsOf(name: string): string {
    return name.split(' ').map((s) => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
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
                <p className="text-xs text-muted">
                    Llegaste al límite de {seatLimit} cupos. Pide al administrador ampliar el equipo para sumar más coaches.
                </p>
            )}

            {feedback && (
                <div className={`rounded-control border px-4 py-3 text-sm ${feedback.type === 'error'
                    ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-400'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'}`}>
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
                                        {isSelf && <span className="font-normal text-muted"> (vos)</span>}
                                    </span>
                                    <span className="truncate text-xs text-muted">{m.display_role || 'Coach'}</span>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {isMemberOwner ? (
                                    <Badge variant="default" className="gap-1"><Crown className="h-3 w-3" /> Owner</Badge>
                                ) : (
                                    m.can_manage && <Badge variant="secondary">Gestor</Badge>
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
                        <AlertDialogTitle>Sacar a {removeTarget?.name} del equipo</AlertDialogTitle>
                        <AlertDialogDescription>
                            Pierde acceso al pool. Los alumnos siguen en el equipo y los ve el resto. Reversible: lo puedes volver a agregar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
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
                        <AlertDialogTitle>Transferir propiedad a {transferTarget?.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {transferTarget?.name} pasa a ser owner del equipo (controla cupos, co-gestores y propiedad). Vos quedas como co-gestor. No se puede deshacer salvo que el nuevo owner te la devuelva.
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

function AddCoachDialog({ teamId, isOwner, open, onOpenChange }: {
    teamId: string
    isOwner: boolean
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const [pending, startTransition] = useTransition()
    const [mode, setMode] = useState<'new' | 'existing'>('new')
    const [error, setError] = useState<string | null>(null)
    const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null)
    const [copied, setCopied] = useState(false)

    const reset = () => { setMode('new'); setError(null); setCreated(null); setCopied(false) }

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

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Agregar coach al equipo</DialogTitle>
                    <DialogDescription>Crea una cuenta nueva o suma un coach que ya tiene cuenta en EVA.</DialogDescription>
                </DialogHeader>

                {created ? (
                    <div className="space-y-3">
                        <p className="text-sm">Cuenta creada para <span className="font-semibold">{created.email}</span>. Comparte estas credenciales (cambiará la contraseña al primer ingreso):</p>
                        <div className="flex items-center justify-between gap-2 rounded-control border border-subtle bg-surface-sunken px-3 py-2 font-mono text-sm">
                            <span className="truncate">{created.tempPassword}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                                navigator.clipboard?.writeText(created.tempPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
                            }}>
                                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => { onOpenChange(false); reset() }}>Listo</Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <Button type="button" variant={mode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setMode('new')}>Cuenta nueva</Button>
                            <Button type="button" variant={mode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setMode('existing')}>Coach existente</Button>
                        </div>

                        {error && (
                            <div className="rounded-control border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">{error}</div>
                        )}

                        {mode === 'new' ? (
                            <NewCoachForm isOwner={isOwner} pending={pending} onSubmitForm={handleNew} />
                        ) : (
                            <form onSubmit={handleExisting} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="ex-email">Email del coach</Label>
                                    <Input id="ex-email" name="email" type="email" required placeholder="coach@email.com" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ex-role">Especialidad (opcional)</Label>
                                    <Input id="ex-role" name="display_role" maxLength={60} placeholder="Nutrición, Kinesiología..." />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}</Button>
                                </DialogFooter>
                            </form>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

function NewCoachForm({ isOwner, pending, onSubmitForm }: {
    isOwner: boolean
    pending: boolean
    onSubmitForm: (e: FormEvent<HTMLFormElement>) => void
}) {
    return (
        <form onSubmit={onSubmitForm} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="nc-name">Nombre completo</Label>
                <Input id="nc-name" name="full_name" required minLength={2} maxLength={120} placeholder="Nombre del coach" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="nc-email">Email</Label>
                <Input id="nc-email" name="email" type="email" required placeholder="coach@email.com" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="nc-role">Especialidad (opcional)</Label>
                <Input id="nc-role" name="display_role" maxLength={60} placeholder="Nutrición, Kinesiología..." />
            </div>
            {isOwner && (
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="can_manage" className="h-4 w-4 rounded border-border" />
                    Hacerlo co-gestor (puede invitar y sacar miembros)
                </label>
            )}
            <DialogFooter>
                <Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear cuenta'}</Button>
            </DialogFooter>
        </form>
    )
}

function EditRoleDialog({ member, pending, onOpenChange, onSave }: {
    member: TeamMemberView | null
    pending: boolean
    onOpenChange: (o: boolean) => void
    onSave: (role: string) => void
}) {
    const [value, setValue] = useState('')
    return (
        <Dialog open={!!member} onOpenChange={(o) => { onOpenChange(o); if (o && member) setValue(member.display_role ?? '') }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Especialidad de {member?.name}</DialogTitle>
                    <DialogDescription>Etiqueta visible para el equipo. No cambia los permisos.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); onSave(value) }} className="space-y-4">
                    <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder="Nutrición, Kinesiología..." autoFocus />
                    <DialogFooter>
                        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
