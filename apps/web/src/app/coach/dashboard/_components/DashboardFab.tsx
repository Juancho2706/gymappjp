'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type LucideIcon, Plus, UserPlus, Upload, Dumbbell } from 'lucide-react'
import { CreateClientModal } from '../../clients/CreateClientModal'

type Action = { label: string; icon: LucideIcon; run: () => void }

/**
 * FAB — quick actions. Verbatim from coach-dashboard.jsx: floating sport button →
 * bottom sheet with "Crear alumno / Importar / Programa". Mobile-only (the desktop
 * bento exposes the same actions in its header). Wires to real routes/modals.
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
                className="fixed bottom-6 right-5 z-30 flex size-14 items-center justify-center rounded-full bg-sport-500 text-white transition-transform hover:-translate-y-0.5 active:scale-95 md:hidden"
                style={{ boxShadow: 'var(--glow-sport), 0 6px 16px rgba(0,0,0,0.18)' }}
            >
                <Plus className="size-7" />
            </button>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    className="fixed inset-0 z-[70] flex flex-col justify-end md:hidden"
                    style={{ background: 'var(--surface-overlay)' }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-t-sheet bg-surface-card px-3.5 pt-2.5"
                        style={{
                            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
                            boxShadow: 'var(--shadow-sheet)',
                        }}
                    >
                        <div className="mx-auto mb-3 mt-1.5 h-1 w-9 rounded-pill bg-[var(--border-default)]" />
                        <div className="px-1.5 pb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                            Acción rápida
                        </div>
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
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-[var(--ink-950)] text-sport-400">
                                        <Icon className="size-5" />
                                    </span>
                                    <span className="text-[15.5px] font-bold text-[var(--text-strong)]">
                                        {a.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </>
    )
}
