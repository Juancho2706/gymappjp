'use client'

import { cn } from '@/lib/utils'

/** Fila del mapa "Plan completo": un EJERCICIO INDIVIDUAL con su estado (QA2-C, sólo lectura). */
export interface ExecListMapItem {
    key: string
    title: string
    /** Letra del miembro dentro de la superserie (A/B/C); null en ejercicios sueltos. */
    letter?: string | null
    /** Encabezado de grupo "Superserie X" — SÓLO en el primer miembro del grupo; null en el resto. */
    groupTitle?: string | null
    doneSets: number
    totalSets: number
    complete: boolean
    /** El ejercicio en curso (AHORA). */
    isCurrent: boolean
}

interface ExecListMapV3Props {
    items: ExecListMapItem[]
}

/**
 * Mapa "Plan completo" del ejecutor V3 (E2.6 · QA2-C): índice de estado SÓLO LECTURA por EJERCICIO
 * INDIVIDUAL con el vocabulario del mockup `concepto-a-v3-core` (`.a3a-srow`) — icono de estado (hecho =
 * marca + check / ahora = aro de marca con punto / pendiente = cuadro gris) + nombre + palabra de estado
 * ("✓ 4/4" / "ahora" / "pendiente"). Los miembros de una superserie son filas propias (con su letra A/B/C)
 * agrupadas bajo un encabezado "Superserie X". El conteo del título (M) coincide con el del header.
 *
 * Es un ÍNDICE PARA VER, no un stepper: las filas NO son interactivas (decisión CEO QA2 — "el plan
 * completo es sólo para ver, no para hacer los ejercicios desde ahí"). Sólo scroll; sin tap ni chevron.
 */
export function ExecListMapV3({ items }: ExecListMapV3Props) {
    return (
        <nav aria-label="Plan completo" className="exec-v3-map">
            <p className="exec-v3-map-title">Plan completo · {items.length}</p>
            <ol className="exec-v3-map-list">
                {items.map((item) => {
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
                            {item.groupTitle && (
                                <p className="exec-v3-map-group">{item.groupTitle}</p>
                            )}
                            <div
                                aria-current={item.isCurrent ? 'true' : undefined}
                                className={cn(
                                    'exec-v3-map-row',
                                    item.letter && 'exec-v3-map-row-member',
                                    state === 'now' && 'is-now',
                                    state === 'done' && 'is-done',
                                )}
                            >
                                <span className="exec-v3-map-state" aria-hidden />
                                {item.letter && (
                                    <span className="exec-v3-map-letter" aria-hidden>
                                        {item.letter}
                                    </span>
                                )}
                                <span className="exec-v3-map-name">{item.title}</span>
                                <span className="exec-v3-map-word tabular-nums" aria-hidden>
                                    {word}
                                </span>
                            </div>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
