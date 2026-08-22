'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRightLeft, GripVertical, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    EMPTY_FIRST_ROUTINE_STATE,
    FIRST_ROUTINE_CARDS,
    dismissAllFirstRoutineCards,
    dismissFirstRoutineCard,
    firstRoutineStorageKey,
    isFirstRoutineDone,
    parseFirstRoutineState,
    serializeFirstRoutineState,
    visibleFirstRoutineCards,
    type FirstRoutineCardId,
    type FirstRoutineState,
} from '../_lib/first-routine'

/**
 * Las 3 tarjetas embebidas de «Primera rutina» (W4 F4.2, SPEC coach-onboarding-v2 §6).
 *
 * NO es un tour: no hay overlay, no hay spotlight, no hay foco robado. Es una tira de tarjetas
 * oscuras que vive DENTRO del lienzo, encima del tablero de días, y que el coach cierra una por
 * una. El builder queda usable en todo momento — se puede arrastrar, editar y guardar con las
 * tarjetas a la vista.
 *
 * Memoria por coach (`firstRoutineStorageKey`): dos coaches en el mismo navegador no se pisan.
 * La lectura del storage va en un efecto para no romper la hidratación.
 */
const CARD_ICONS: Record<FirstRoutineCardId, LucideIcon> = {
    'cambia-ejercicio': ArrowRightLeft,
    reordena: GripVertical,
    'ab-despues': Layers,
}

export function FirstRoutineCards({
    coachId,
    open,
    onAllDismissed,
}: {
    /** Namespace del recuerdo. `null` ⇒ clave anónima, nunca la global de antes. */
    coachId?: string | null
    /** El flujo «primera rutina» está activo (`?primera=1`). */
    open: boolean
    /** Se llama cuando el coach cierra la última tarjeta. */
    onAllDismissed?: () => void
}) {
    const storageKey = firstRoutineStorageKey(coachId)
    const [state, setState] = useState<FirstRoutineState>(EMPTY_FIRST_ROUTINE_STATE)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        setReady(false)
        try {
            setState(parseFirstRoutineState(window.localStorage.getItem(storageKey)))
        } catch {
            setState(EMPTY_FIRST_ROUTINE_STATE)
        }
        setReady(true)
    }, [storageKey])

    const persist = useCallback(
        (next: FirstRoutineState) => {
            setState(next)
            try {
                window.localStorage.setItem(storageKey, serializeFirstRoutineState(next))
            } catch {
                /* modo privado / storage lleno: la tira igual se cierra en esta sesión */
            }
            if (isFirstRoutineDone(next)) onAllDismissed?.()
        },
        [storageKey, onAllDismissed],
    )

    if (!open || !ready) return null

    const visible = visibleFirstRoutineCards(state)
    if (visible.length === 0) return null

    return (
        <section
            aria-label="Primeros pasos en el lienzo"
            className="flex shrink-0 gap-2.5 overflow-x-auto px-4 pb-1 pt-3 md:px-6 md:pb-2 [scrollbar-width:none]"
        >
            {visible.map((card) => {
                const Icon = CARD_ICONS[card.id]
                const position = FIRST_ROUTINE_CARDS.findIndex((c) => c.id === card.id) + 1
                const isLast = card.id === FIRST_ROUTINE_CARDS[FIRST_ROUTINE_CARDS.length - 1].id
                return (
                    <article
                        key={card.id}
                        className={cn(
                            'flex min-w-[248px] max-w-[320px] flex-1 shrink-0 flex-col gap-1.5 rounded-card p-3.5',
                            'border border-[var(--border-inverse)] bg-[var(--surface-inverse)] text-[var(--text-on-dark)]',
                            'shadow-[var(--shadow-sm)]',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                                <Icon className="size-[15px]" aria-hidden />
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-on-dark-muted)]">
                                Paso {position} de {FIRST_ROUTINE_CARDS.length}
                            </span>
                        </div>
                        <h3 className="font-display text-[15px] font-extrabold tracking-[-0.01em]">
                            {card.title}
                        </h3>
                        <p className="text-[12.5px] leading-snug text-[var(--text-on-dark-muted)]">
                            {card.body}
                        </p>
                        <button
                            type="button"
                            onClick={() =>
                                persist(
                                    isLast
                                        ? dismissAllFirstRoutineCards()
                                        : dismissFirstRoutineCard(state, card.id),
                                )
                            }
                            className="mt-1 inline-flex h-9 w-fit items-center rounded-control bg-white/12 px-3 text-[12.5px] font-bold text-[var(--text-on-dark)] transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            {card.cta}
                        </button>
                    </article>
                )
            })}
        </section>
    )
}
