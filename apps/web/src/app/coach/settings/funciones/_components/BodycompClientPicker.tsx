'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronRight, Ruler, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import type { BodycompClient } from '../_data/bodycomp-clients.queries'

/**
 * Selector de alumno SINGLE para Composicion corporal (Ola de orden W3.1, decision 6A).
 *
 * Venia del launcher `/coach/tools` (`ToolsHub`, ahora demolido): Composicion es el unico dominio
 * sin pantalla propia — se mide a UNA persona a la vez, asi que el «Abrir» de su fila pregunta
 * primero a quien y recien despues navega a `/coach/clients/<id>/bodycomp`.
 *
 * Desktop -> Dialog, movil -> bottom-sheet con safe areas (mismo patron que «Asignar» en
 * Programas). Esto es NAVEGACION: quien puede ver la ficha lo siguen decidiendo RLS y el
 * entitlement de la pantalla destino, no este picker.
 */

function subscribePickerMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 760px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up: desktop -> Dialog, movil -> bottom-sheet. */
function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribePickerMd,
        () => window.matchMedia('(min-width: 760px)').matches,
        () => true,
    )
}

function PickerBody({
    clients,
    onPick,
}: {
    clients: BodycompClient[]
    onPick: (id: string) => void
}) {
    const [q, setQ] = useState('')
    const list = useMemo(
        () =>
            clients.filter((c) =>
                (c.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()),
            ),
        [clients, q],
    )
    return (
        <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-[11px] pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-sport-100 text-sport-600">
                    <Ruler className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-extrabold text-strong">Elige un alumno</p>
                    <p className="text-[12.5px] text-muted">
                        Composición corporal · se mide a una persona a la vez
                    </p>
                </div>
            </div>
            <div className="mb-2.5">
                <Input
                    iconLeft={<Search aria-hidden />}
                    placeholder="Buscar alumno…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
            </div>
            <div className="-mx-1 flex max-h-[52vh] flex-col overflow-y-auto overscroll-contain">
                {list.length === 0 && (
                    <p className="py-7 text-center text-[13px] text-subtle">
                        {clients.length === 0 ? 'Todavía no tienes alumnos' : 'Sin resultados'}
                    </p>
                )}
                {list.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onPick(c.id)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-[11px] text-left transition-colors hover:bg-surface-sunken active:scale-[0.99]"
                    >
                        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-sm font-extrabold text-[var(--sport-400)]">
                            {(c.full_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-strong">
                            {c.full_name ?? 'Alumno'}
                        </span>
                        <ChevronRight className="size-[17px] shrink-0 text-[var(--ink-300)]" aria-hidden />
                    </button>
                ))}
            </div>
        </div>
    )
}

export function BodycompClientPicker({
    open,
    clients,
    onOpenChange,
    onPick,
}: {
    open: boolean
    clients: BodycompClient[]
    onOpenChange: (open: boolean) => void
    onPick: (id: string) => void
}) {
    const isDesktop = useIsDesktopMd()
    const description = 'Elige a quién medir — la captura es 1-a-1.'

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[min(88dvh,88svh)] overflow-y-auto overscroll-contain border-subtle bg-surface-card text-body sm:max-w-[440px]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Elige un alumno</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    <PickerBody clients={clients} onPick={onPick} />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
            >
                <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <div
                        className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]"
                        aria-hidden="true"
                    />
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="sr-only">Elige un alumno</SheetTitle>
                        <SheetDescription className="sr-only">{description}</SheetDescription>
                    </SheetHeader>
                    <PickerBody clients={clients} onPick={onPick} />
                </div>
            </SheetContent>
        </Sheet>
    )
}
