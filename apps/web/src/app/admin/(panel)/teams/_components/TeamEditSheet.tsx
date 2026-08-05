'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { updateTeamAction, setTeamSuspendedAction } from '../_actions/teams.actions'
import { MODULE_KEYS, MODULE_LABELS } from '../../_components/module-labels'
import type { AdminTeamRow } from '../_data/teams.queries'

interface Props {
    team: AdminTeamRow | null
    onClose: () => void
}

export function TeamEditSheet({ team, onClose }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const fieldCls = 'mt-1 bg-surface-sunken border-subtle text-strong placeholder:text-muted'
    const isSuspended = Boolean(team?.suspended_at)

    return (
        <Sheet open={!!team} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-lg bg-surface-card border-subtle text-strong overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-strong">Editar {team?.name}</SheetTitle>
                </SheetHeader>

                {team && (
                    <form
                        action={(fd) => {
                            setError(null)
                            startTransition(async () => {
                                const res = await updateTeamAction(team.id, fd)
                                if (res && 'error' in res) {
                                    setError(res.error)
                                    toast.error(res.error)
                                    return
                                }
                                toast.success('Equipo actualizado')
                                router.refresh()
                                onClose()
                            })
                        }}
                        className="mt-6 space-y-4"
                    >
                        <div>
                            <Label className="text-body text-xs">Nombre del equipo</Label>
                            <Input name="name" defaultValue={team.name} className={fieldCls} required minLength={2} maxLength={80} />
                        </div>
                        <div>
                            <Label className="text-body text-xs">Cupos (seat_limit)</Label>
                            <Input name="seat_limit" type="number" min={1} max={500} defaultValue={team.seat_limit} className={fieldCls} required />
                            <p className="mt-1 text-[10px] text-muted">{team.memberCount} miembros activos · no se puede bajar por debajo de eso</p>
                        </div>
                        <div className="rounded-lg border border-subtle p-3">
                            <p className="text-xs font-medium text-body">Módulos habilitados</p>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                                {MODULE_KEYS.map(key => (
                                    <label key={key} className="flex items-center gap-2 text-sm text-body">
                                        <input type="checkbox" name={`module_${key}`} defaultChecked={team.enabled_modules[key] === true} className="h-4 w-4 rounded border-subtle bg-surface-sunken" />
                                        {MODULE_LABELS[key]}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-[var(--danger-500)]/30 bg-[var(--danger-500)]/15 px-3 py-2">
                                <p className="text-sm text-[var(--danger-500)]">{error}</p>
                            </div>
                        )}

                        <SheetFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose} className="text-body">Cancelar</Button>
                            <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar cambios'}</Button>
                        </SheetFooter>
                    </form>
                )}

                {team && (
                    <div className="mt-8 rounded-lg border border-[var(--danger-500)]/30 bg-[var(--danger-500)]/15 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger-500)]">Kill-switch</p>
                        <p className="mt-1 text-xs text-muted">
                            {isSuspended
                                ? 'Equipo SUSPENDIDO: alumnos y coaches no pueden entrar. Reactivar lo restaura tal cual.'
                                : 'Suspende el equipo completo: el shell /t deja de resolver y los coaches pierden el contexto. Reversible, no borra nada.'}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => setConfirmOpen(true)}
                            className={`mt-3 ${isSuspended ? 'border-[var(--success-500)]/30 text-[var(--success-500)] hover:bg-[var(--success-500)]/15' : 'border-[var(--danger-500)]/30 text-[var(--danger-500)] hover:bg-[var(--danger-500)]/15'}`}
                        >
                            {isSuspended ? 'Reactivar equipo' : 'Suspender equipo'}
                        </Button>

                        {/* El CEO decide viendo el costo real: los conteos vienen de la fila (AdminTeamRow). */}
                        <AdminConfirmDialog
                            open={confirmOpen}
                            onOpenChange={setConfirmOpen}
                            title={isSuspended ? `Reactivar ${team.name}` : `Suspender ${team.name}`}
                            description={isSuspended
                                ? 'El equipo vuelve a resolver: coaches recuperan el workspace y los alumnos entran de nuevo por /t.'
                                : 'El shell /t deja de resolver y los coaches pierden el contexto del equipo. Es reversible y no borra nada.'}
                            blastRadius={isSuspended
                                ? `Restaura el acceso a ${team.memberCount} coaches y ${team.clientCount} alumnos`
                                : `Deja sin acceso a ${team.memberCount} coaches y ${team.clientCount} alumnos`}
                            severity={isSuspended ? 'warning' : 'danger'}
                            confirmLabel={isSuspended ? 'Reactivar equipo' : 'Suspender equipo'}
                            onConfirm={async () => {
                                setError(null)
                                const res = await setTeamSuspendedAction(team.id, !isSuspended)
                                if (res && 'error' in res) {
                                    setError(res.error)
                                    toast.error(res.error)
                                    return
                                }
                                toast.success(isSuspended ? 'Equipo reactivado' : 'Equipo suspendido')
                                router.refresh()
                                onClose()
                            }}
                        />
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
