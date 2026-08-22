'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    dismissGuidedSurface,
    isGuidedSurfaceDismissed,
    readGuidedCardsMemory,
    type GuidedSurface,
} from './guided-cards-memory'

/**
 * Tarjetas guiadas EMBEBIDAS de las tareas del onboarding v2 (SPEC §6-§7, TASKS W4 F4.3).
 *
 * Tres tarjetas numeradas dentro de la pantalla real —nunca un velo, nunca un pop-up, nunca un
 * builder en blanco—: el coach hace el trabajo de verdad mientras las lee. Cada tarjeta puede
 * traer UNA acción, y se tilda sola cuando la señal real llega (`done`), no cuando el coach hace
 * clic.
 *
 * Es la MECÁNICA compartida por las tres ramas (pauta · screening · zonas). El copy y las señales
 * viven en cada superficie, que es la que sabe qué significa «hecho».
 *
 * Dónde vive: nace en `nutrition-v2/_components/guided` porque la pauta fue la primera rama, pero
 * lo consumen también movimiento y cardio. Su casa natural es `coach/_components` — el traslado
 * queda declarado como pendiente de la tanda (mismo archivo, mismo contrato).
 */

export interface GuidedTaskCardAction {
    label: string
    onClick: () => void
    busy?: boolean
    disabled?: boolean
    /** `primary` = CTA sport del DS; `ghost` = link discreto. Default `ghost`. */
    tone?: 'primary' | 'ghost'
    icon?: ReactNode
}

export interface GuidedTaskCardModel {
    /** Id estable de la tarjeta (para la key y para los tests). */
    id: string
    title: string
    body: string
    /** Señal REAL de que ya está hecha. La tarjeta se tilda; no se oculta. */
    done?: boolean
    action?: GuidedTaskCardAction
}

export function GuidedTaskCards({
    coachId,
    surface,
    eyebrow,
    title,
    cards,
    footnote,
    className,
}: {
    /** Memoria por coach: dos coaches en el mismo navegador no se pisan la ayuda. */
    coachId: string
    surface: GuidedSurface
    eyebrow: string
    title: string
    cards: readonly GuidedTaskCardModel[]
    /** Línea al pie: aclara el escape («puedes cerrarlas, no vuelven»). */
    footnote?: string
    className?: string
}) {
    // Se decide en el cliente (localStorage). Hasta entonces NO se pinta: pintarlas y esconderlas
    // después daría un parpadeo, y un mismatch de hidratación en una pantalla de trabajo.
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (isGuidedSurfaceDismissed(readGuidedCardsMemory(coachId), surface)) return
        setVisible(true)
    }, [coachId, surface])

    if (!visible || cards.length === 0) return null

    const hide = () => {
        dismissGuidedSurface(coachId, surface)
        setVisible(false)
    }

    return (
        <section
            aria-label={title}
            data-testid="guided-task-cards"
            className={cn(
                'rounded-card border border-[color:var(--sport-500)]/25 bg-sport-100/40 p-3.5',
                className,
            )}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sport-600">{eyebrow}</p>
                    <h2 className="mt-0.5 text-[14.5px] font-extrabold leading-snug text-strong">{title}</h2>
                </div>
                <button
                    type="button"
                    onClick={hide}
                    aria-label="Ocultar la ayuda"
                    className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    <X className="size-4" aria-hidden />
                </button>
            </div>

            <ol className="mt-2.5 grid list-none grid-cols-1 gap-2 sm:grid-cols-3">
                {cards.map((card, index) => (
                    <li
                        key={card.id}
                        data-testid={`guided-card-${card.id}`}
                        className="flex flex-col rounded-control border border-subtle bg-surface-card p-3"
                    >
                        <div className="flex items-center gap-2">
                            <span
                                aria-hidden
                                className={cn(
                                    'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black',
                                    card.done
                                        ? 'bg-[var(--sport-500)] text-white'
                                        : 'border-2 border-[var(--border-subtle)] text-muted',
                                )}
                            >
                                {card.done ? <Check className="size-3" /> : index + 1}
                            </span>
                            <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-strong">
                                {card.title}
                            </p>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-muted">{card.body}</p>
                        {card.action ? (
                            <button
                                type="button"
                                onClick={card.action.onClick}
                                disabled={card.action.disabled === true || card.action.busy === true}
                                aria-busy={card.action.busy === true}
                                className={cn(
                                    'eva-press mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control px-3 text-[13px] font-bold transition-opacity disabled:opacity-50',
                                    card.action.tone === 'primary'
                                        ? 'bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] hover:opacity-90'
                                        : 'border border-subtle text-strong hover:bg-surface-sunken',
                                )}
                            >
                                {card.action.busy === true ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                ) : (
                                    card.action.icon
                                )}
                                {card.action.label}
                            </button>
                        ) : null}
                    </li>
                ))}
            </ol>

            {footnote ? <p className="mt-2 text-[11.5px] leading-snug text-muted">{footnote}</p> : null}
        </section>
    )
}
