'use client'

import { ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Fila del mapa "Ver todo": un paso del plan (bloque suelto o superserie) con su progreso. */
export interface ExecListMapItem {
    key: string
    /** Índice del paso en el stepper (destino del tap). */
    stepIndex: number
    title: string
    sectionTitle: string
    doneSets: number
    totalSets: number
    complete: boolean
    /** El ejercicio en curso (AHORA). */
    isCurrent: boolean
}

interface ExecListMapV3Props {
    items: ExecListMapItem[]
    /** Salta al stepper en ese paso (usa la navegación de pasos existente). */
    onJump: (stepIndex: number) => void
}

/**
 * Mapa "Ver todo" del ejecutor V3 (E2.6): la vista lista gana este resumen tappable por ejercicio con
 * estado (dots hechos/total, AHORA resaltado). Tap en una fila = volver al stepper EN ese paso (misma
 * navegación de pasos). No duplica el render de la lista — es un índice de navegación por encima de
 * ella. Sólo presentación/navegación; el motor vive en las cards de abajo.
 */
export function ExecListMapV3({ items, onJump }: ExecListMapV3Props) {
    return (
        <nav aria-label="Mapa del entrenamiento" className="exec-v3-map">
            <p className="exec-v3-map-title">Ver todo</p>
            <ol className="exec-v3-map-list">
                {items.map((item, i) => (
                    <li key={item.key}>
                        <button
                            type="button"
                            onClick={() => onJump(item.stepIndex)}
                            aria-label={`Ir al ejercicio ${i + 1}: ${item.title} (${item.doneSets} de ${item.totalSets} series)`}
                            aria-current={item.isCurrent ? 'true' : undefined}
                            className={cn(
                                'exec-v3-map-row',
                                item.isCurrent && 'is-now',
                                item.complete && 'is-done',
                            )}
                        >
                            <span className="exec-v3-map-idx tabular-nums">{i + 1}</span>
                            <span className="exec-v3-map-body">
                                <span className="exec-v3-map-name">{item.title}</span>
                                <span className="exec-v3-map-dots" aria-hidden>
                                    {Array.from({ length: item.totalSets }).map((_, s) => (
                                        <span
                                            key={s}
                                            className={cn('exec-v3-map-dot', s < item.doneSets && 'is-on')}
                                        />
                                    ))}
                                    <span className="exec-v3-map-count tabular-nums">
                                        {item.doneSets}/{item.totalSets}
                                    </span>
                                </span>
                            </span>
                            {item.isCurrent && <span className="exec-v3-map-badge">AHORA</span>}
                            <ArrowLeftRight className="exec-v3-map-go h-3.5 w-3.5" aria-hidden />
                        </button>
                    </li>
                ))}
            </ol>
        </nav>
    )
}
