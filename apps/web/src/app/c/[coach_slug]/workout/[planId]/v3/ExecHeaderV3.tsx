'use client'

import { ArrowLeft, Settings, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExecDotState = 'done' | 'now' | 'todo'

interface ExecHeaderV3Props {
    /** Estado por ejercicio del plan (dots del header; el `now` late vía CSS). */
    dots: ExecDotState[]
    exerciseNum: number
    totalExercises: number
    /** Métricas de sesión (ya NO se pintan en el header V3 — viven en el peek de descanso y el
     *  resumen final). Se conservan en la interfaz por compatibilidad con el call-site del motor. */
    completedSets?: number
    requiredSets?: number
    elapsedLabel?: string
    volumeLabel?: string | null
    onExit: () => void
    onSettings: () => void
    /** Salta a la vista lista "Ver todo" (E2.6). */
    onViewAll?: () => void
    /** Muestra el chip "Ver todo" (sólo en modo stepper; en la lista el FAB hace el regreso). */
    showViewAll?: boolean
}

/**
 * Header del ejecutor V3 (E2.1) — traducción del mockup `concepto-a-v3-core` (pantalla Fuerza):
 * UNA sola fila = [salir] [dots de progreso] "Ejercicio X de Y" [Ver todo] [tuerca]. El dot del
 * ejercicio actual "late" (respeta `prefers-reduced-motion` vía CSS). Chips sólidos cálidos
 * (#1a1a22 / borde 1.5px #2f2f3a / #b7b7c2), NO vidrio. Sin fila meta (series/volumen/cronómetro):
 * esa info vive en el peek de descanso y en el resumen final. Dark-only.
 *
 * Reemplaza al header sticky legacy (V3 es el único ejecutor; el legacy se OCULTA, no se borra).
 * Consume `--exec-brand` (resuelto por `exec-theme.ts`).
 */
export function ExecHeaderV3({
    dots,
    exerciseNum,
    totalExercises,
    onExit,
    onSettings,
    onViewAll,
    showViewAll = false,
}: ExecHeaderV3Props) {
    const chip =
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#2f2f3a] bg-[#1a1a22] text-[#b7b7c2] transition-colors hover:text-on-dark'
    return (
        <div className="exec-v3-header sticky top-0 z-20 pt-safe backdrop-blur">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-2.5 md:px-8">
                <button type="button" onClick={onExit} aria-label="Salir" className={chip}>
                    <ArrowLeft className="h-[19px] w-[19px]" />
                </button>

                <div
                    className="flex flex-1 items-center gap-[7px]"
                    role="img"
                    aria-label={`Ejercicio ${exerciseNum} de ${totalExercises}`}
                >
                    {dots.map((state, i) => (
                        <span
                            key={i}
                            className={cn(
                                'exec-v3-dot',
                                state === 'done' && 'is-done',
                                state === 'now' && 'is-now',
                            )}
                        />
                    ))}
                </div>

                <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-on-dark">
                    Ejercicio {exerciseNum}{' '}
                    <span className="font-extrabold text-on-dark-muted">de {totalExercises}</span>
                </span>

                {showViewAll && onViewAll && (
                    <button
                        type="button"
                        onClick={onViewAll}
                        aria-label="Ver todos los ejercicios"
                        className={chip}
                    >
                        <List className="h-[19px] w-[19px]" />
                    </button>
                )}

                <button
                    type="button"
                    onClick={onSettings}
                    aria-label="Ajustes del entrenamiento"
                    className={chip}
                >
                    <Settings className="h-[19px] w-[19px]" />
                </button>
            </div>
        </div>
    )
}
