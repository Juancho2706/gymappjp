'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type LucideIcon, Plus, UserPlus, Upload, Dumbbell } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CreateClientModal } from '../../clients/CreateClientModal'

type Action = { label: string; icon: LucideIcon; run: () => void }

/**
 * FAB — quick actions. Verbatim from coach-dashboard.jsx: floating sport button →
 * bottom sheet with "Crear alumno / Importar / Programa". Mobile-only (the desktop
 * bento exposes the same actions in its header). Wires to real routes/modals.
 *
 * El botón usa `--cta-fill` (fill SÓLIDO derivado de la marca) en vez de `bg-sport-500`
 * (translúcido al 70% en dark → el FAB se veía transparente sobre el contenido). El sheet
 * de acciones se monta con el componente `Sheet` (portal a `document.body`, z-[71]) para
 * que SIEMPRE quede por encima de la cápsula de navegación flotante (z-50) — antes el
 * `<div fixed>` propio quedaba atrapado en el stacking context del <main> y la barra lo tapaba.
 */
export function DashboardFab() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    const actions: Action[] = [
        { label: 'Crear alumno', icon: UserPlus, run: () => setCreateOpen(true) },
        { label: 'Importar', icon: Upload, run: () => router.push('/coach/clients') },
        { label: 'Programa', icon: Dumbbell, run: () => router.push('/coach/workout-programs') },
    ]

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Acciones rápidas"
                className="fixed right-5 z-40 flex size-14 items-center justify-center rounded-full bg-[var(--cta-fill)] text-[var(--text-on-sport)] transition-transform hover:-translate-y-0.5 active:scale-95 md:hidden"
                style={{
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
                    boxShadow: 'var(--glow-sport), 0 8px 22px rgba(13,18,28,0.28)',
                }}
            >
                <Plus className="size-7" />
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="max-h-[min(80dvh,80svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body md:hidden"
                >
                    <div className="flex flex-col px-3.5 pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))]">
                        <div
                            className="mx-auto mb-2 mt-1.5 h-1 w-9 shrink-0 rounded-pill bg-[var(--border-default)]"
                            aria-hidden="true"
                        />
                        <SheetHeader className="border-0 bg-transparent p-0">
                            <SheetTitle className="px-1.5 pb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                                Acción rápida
                            </SheetTitle>
                        </SheetHeader>
                        {actions.map((a) => {
                            const Icon = a.icon
                            return (
                                <button
                                    key={a.label}
                                    type="button"
                                    onClick={() => {
                                        setOpen(false)
                                        a.run()
                                    }}
                                    className="flex w-full items-center gap-3.5 px-1.5 py-3.5 text-left"
                                >
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--ink-950)] text-sport-400">
                                        <Icon className="size-5" />
                                    </span>
                                    <span className="text-[15.5px] font-bold text-[var(--text-strong)]">
                                        {a.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </SheetContent>
            </Sheet>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </>
    )
}
