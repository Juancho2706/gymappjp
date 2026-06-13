'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

    const fieldCls = 'mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600'

    return (
        <Sheet open={!!team} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-lg bg-neutral-950 border-neutral-800 text-white overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-white">Editar {team?.name}</SheetTitle>
                </SheetHeader>

                {team && (
                    <form
                        action={(fd) => {
                            setError(null)
                            startTransition(async () => {
                                const res = await updateTeamAction(team.id, fd)
                                if (res && 'error' in res) { setError(res.error); return }
                                router.refresh()
                                onClose()
                            })
                        }}
                        className="mt-6 space-y-4"
                    >
                        <div>
                            <Label className="text-neutral-300 text-xs">Nombre del equipo</Label>
                            <Input name="name" defaultValue={team.name} className={fieldCls} required minLength={2} maxLength={80} />
                        </div>
                        <div>
                            <Label className="text-neutral-300 text-xs">Cupos (seat_limit)</Label>
                            <Input name="seat_limit" type="number" min={1} max={500} defaultValue={team.seat_limit} className={fieldCls} required />
                            <p className="mt-1 text-[10px] text-neutral-500">{team.memberCount} miembros activos · no se puede bajar por debajo de eso</p>
                        </div>
                        <div className="rounded-lg border border-neutral-800 p-3">
                            <p className="text-xs font-medium text-neutral-300">Módulos habilitados</p>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                                {MODULE_KEYS.map(key => (
                                    <label key={key} className="flex items-center gap-2 text-sm text-neutral-200">
                                        <input type="checkbox" name={`module_${key}`} defaultChecked={team.enabled_modules[key] === true} className="h-4 w-4 rounded border-neutral-700 bg-neutral-900" />
                                        {MODULE_LABELS[key]}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <SheetFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose} className="text-neutral-300">Cancelar</Button>
                            <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar cambios'}</Button>
                        </SheetFooter>
                    </form>
                )}

                {team && (
                    <div className="mt-8 rounded-lg border border-red-500/25 bg-red-500/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Kill-switch</p>
                        <p className="mt-1 text-xs text-neutral-400">
                            {team.suspended_at
                                ? 'Equipo SUSPENDIDO: alumnos y coaches no pueden entrar. Reactivar lo restaura tal cual.'
                                : 'Suspende el equipo completo: el shell /t deja de resolver y los coaches pierden el contexto. Reversible, no borra nada.'}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => {
                                setError(null)
                                startTransition(async () => {
                                    const res = await setTeamSuspendedAction(team.id, !team.suspended_at)
                                    if (res && 'error' in res) { setError(res.error); return }
                                    router.refresh()
                                    onClose()
                                })
                            }}
                            className={`mt-3 ${team.suspended_at ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-red-500/40 text-red-400 hover:bg-red-500/10'}`}
                        >
                            {isPending ? 'Aplicando...' : team.suspended_at ? 'Reactivar equipo' : 'Suspender equipo'}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
