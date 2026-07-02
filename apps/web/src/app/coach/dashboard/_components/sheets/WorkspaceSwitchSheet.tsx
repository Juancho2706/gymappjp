'use client'

import { useState, useTransition } from 'react'
import { Building2, Check, Dumbbell, GraduationCap, Loader2, UserCog, UsersRound } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { selectWorkspaceAction } from '@/app/workspace/select/select.actions'
import { workspaceKey } from '@/services/auth/workspace.service'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    workspaces: WorkspaceSummary[]
}

function iconFor(type: string) {
    if (type === 'enterprise_staff') return UserCog
    if (type === 'enterprise_coach') return Building2
    if (type === 'coach_standalone') return Dumbbell
    if (type === 'coach_team') return UsersRound
    return GraduationCap
}

/**
 * Bottom-sheet de cambio de espacio (PWA / móvil) — abre desde el avatar del header del
 * dashboard. Reusa EXACTAMENTE el flujo de /workspace/select (selectWorkspaceAction persiste
 * la preferencia + refresca el JWT + redirige); acá no hay lógica de auth propia. El espacio
 * activo (isLastUsed) queda marcado; tocarlo solo cierra el sheet.
 */
export function WorkspaceSwitchSheet({ open, onOpenChange, workspaces }: Props) {
    const [switchingKey, setSwitchingKey] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleSwitch(ws: WorkspaceSummary) {
        if (ws.isLastUsed) {
            onOpenChange(false)
            return
        }
        const key = workspaceKey(ws)
        setSwitchingKey(key)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('workspace_key', key)
            await selectWorkspaceAction(fd)
        })
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[min(80dvh,80svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
            >
                <div className="flex flex-col overflow-y-auto overscroll-contain px-[18px] pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                    <div
                        className="mx-auto mb-3.5 h-1 w-[38px] shrink-0 rounded-pill bg-[var(--ink-200)]"
                        aria-hidden="true"
                    />
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="font-display text-[19px] font-extrabold text-strong">
                            ¿En qué espacio querés trabajar?
                        </SheetTitle>
                        <SheetDescription className="mt-1 text-[12.5px] text-subtle">
                            Cada espacio separa datos, marca y permisos.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 flex flex-col gap-2">
                        {workspaces.map((ws) => {
                            const Icon = iconFor(ws.type)
                            const key = workspaceKey(ws)
                            const isCurrent = ws.isLastUsed
                            const isSwitching = switchingKey === key
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleSwitch(ws)}
                                    disabled={pending}
                                    aria-current={isCurrent ? 'true' : undefined}
                                    className={`flex min-h-[56px] items-center gap-3.5 rounded-card border p-3 text-left transition-colors disabled:opacity-60 ${
                                        isCurrent
                                            ? 'border-[var(--sport-300)] bg-[var(--sport-100)]'
                                            : 'border-subtle bg-surface-card hover:bg-surface-sunken'
                                    }`}
                                >
                                    <span
                                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-control"
                                        style={
                                            isCurrent
                                                ? { background: 'var(--sport-500)', color: 'var(--text-on-sport)' }
                                                : { background: 'var(--surface-sunken)', color: 'var(--ink-700)' }
                                        }
                                    >
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14.5px] font-bold text-strong">{ws.label}</p>
                                        <p className="mt-0.5 truncate text-[11.5px] capitalize text-subtle">
                                            {ws.type.replace(/_/g, ' ')}
                                        </p>
                                    </div>
                                    {isCurrent ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-sport-600">
                                            <Check className="size-3.5" /> Actual
                                        </span>
                                    ) : isSwitching ? (
                                        <Loader2 className="size-4 shrink-0 animate-spin text-subtle" />
                                    ) : null}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
