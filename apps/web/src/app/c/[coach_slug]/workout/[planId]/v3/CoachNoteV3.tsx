'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * Ejecutor V3 — nota del coach COMPARTIDA (chip + sheet oscura #1d1d26). Extracción del sheet inline que
 * vivía en `ExecMediaCard`, para reusarlo SIN duplicar estilos en TODOS los tipos de bloque: fuerza y
 * superserie lo montan vía `ExecMediaCard` (chip glass sobre la media); cardio/roller/movilidad lo montan
 * vía `CoachNoteChip` (pill de acento, sin media grande). El acento sale de `var(--exec-brand)` scoped en
 * `[data-exec-v3]`; en las pantallas calmas (`.exec-v3-calm`) ese token ya resuelve al recovery aqua, así
 * que el chip adopta el acento correcto por pantalla sin lógica extra. Sin nota → no renderiza nada.
 */

/** Sheet OSCURA de la nota del coach (bottom-sheet V3). Se monta dentro de `[data-exec-v3]`, sin portal. */
export function CoachNoteSheet({
    open,
    note,
    onClose,
}: {
    open: boolean
    note: string | null
    onClose: () => void
}) {
    const reducedMotion = useReducedMotion()
    return (
        <AnimatePresence>
            {open && note && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Cerrar nota del coach"
                        onClick={onClose}
                        className="exec-v3-sheet-scrim"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                    />
                    <motion.div
                        className="exec-v3-settings"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Nota del coach"
                        style={{ background: '#1d1d26' }}
                        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                    >
                        <span className="exec-v3-handle" aria-hidden />
                        <h2 className="font-display text-lg font-bold text-on-dark">Nota del coach</h2>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-on-dark-muted">{note}</p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-6 w-full rounded-control border border-[var(--border-inverse)] bg-white/[0.06] py-3 font-bold text-on-dark transition-colors hover:bg-white/[0.10]"
                        >
                            Entendido
                        </button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

/**
 * Chip AUTOCONTENIDO "Nota del coach" (icono + label + badge de marca) + su sheet local. Para las
 * pantallas tipadas que NO montan `ExecMediaCard` (cardio/roller/movilidad). Renderiza `null` sin nota.
 */
export function CoachNoteChip({ note }: { note: string | null }) {
    const [open, setOpen] = useState(false)
    if (!note) return null
    return (
        <>
            <button
                type="button"
                className="exec-v3-notechip"
                onClick={() => setOpen(true)}
                aria-label="Ver la nota del coach"
            >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                <span>Nota del coach</span>
                <span className="exec-v3-badge" aria-hidden />
            </button>
            <CoachNoteSheet open={open} note={note} onClose={() => setOpen(false)} />
        </>
    )
}
