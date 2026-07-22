'use client'

import { cn } from '@/lib/utils'

/** Fila del mapa "Plan completo": un paso del plan (bloque suelto o superserie) con su estado. */
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
 * Mapa "Plan completo" del ejecutor V3 (E2.6): índice tappable por ejercicio con el vocabulario del
 * mockup `concepto-a-v3-core` (`.a3a-srow`) — icono de estado (hecho = marca + check / ahora = aro
 * de marca con punto / pendiente = cuadro gris) + nombre + palabra de estado ("✓ 4/4" / "ahora" /
 * "pendiente"). Tap en una fila = volver al stepper EN ese paso (misma navegación). No imprime título
 * propio: el encabezado ("Plan completo" + conteo) lo aporta el contenedor (peek de descanso).
 * Sólo presentación/navegación; el motor vive en las cards de abajo.
 */
export function ExecListMapV3({ items, onJump }: ExecListMapV3Props) {
    return (
        <nav aria-label="Plan completo" className="exec-v3-map">
            <ol className="exec-v3-map-list">
                {items.map((item, i) => {
                    const state = item.complete ? 'done' : item.isCurrent ? 'now' : 'todo'
                    const word =
                        state === 'done'
                            ? `✓ ${item.doneSets}/${item.totalSets}`
                            : state === 'now'
                              ? 'ahora'
                              : item.doneSets > 0
                                ? `${item.doneSets}/${item.totalSets}`
                                : 'pendiente'
                    return (
                        <li key={item.key}>
                            <button
                                type="button"
                                onClick={() => onJump(item.stepIndex)}
                                aria-label={`Ir al ejercicio ${i + 1}: ${item.title} (${item.doneSets} de ${item.totalSets} series)`}
                                aria-current={item.isCurrent ? 'true' : undefined}
                                className={cn(
                                    'exec-v3-map-row',
                                    state === 'now' && 'is-now',
                                    state === 'done' && 'is-done',
                                )}
                            >
                                <span className="exec-v3-map-state" aria-hidden />
                                <span className="exec-v3-map-name">{item.title}</span>
                                <span className="exec-v3-map-word tabular-nums" aria-hidden>
                                    {word}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
