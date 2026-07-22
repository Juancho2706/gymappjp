'use client'

import { ArrowLeft, Settings, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExecDotState = 'done' | 'now' | 'todo'

interface ExecHeaderV3Props {
    /** Estado por ejercicio del plan (dots del header; el `now` late vía CSS). */
    dots: ExecDotState[]
    exerciseNum: number
    totalExercises: number
    completedSets: number
    requiredSets: number
    /** Cronómetro de sesión ya formateado (mm:ss / h:mm:ss). */
    elapsedLabel: string
    volumeLabel?: string | null
    onExit: () => void
    onSettings: () => void
    /** Salta a la vista lista "Ver todo" (E2.6). */
    onViewAll?: () => void
    /** Muestra el botón "Ver todo" (sólo en modo stepper; en la lista el FAB hace el regreso). */
    showViewAll?: boolean
}

/**
 * Header del ejecutor V3 (E2.1) — traducción del mockup `concepto-a-v3-core` (pantalla Fuerza):
 * dots de progreso por ejercicio (el actual late; respeta `prefers-reduced-motion` vía CSS),
 * "Ejercicio X de Y", cronómetro y tuerca (Ajustes placeholder). Dark-only.
 *
 * Reemplaza al header sticky legacy cuando el flag `executor_v3` está activo (el legacy se
 * OCULTA, no se borra). Consume `--exec-brand` (resuelto por `exec-theme.ts`).
 */
export function ExecHeaderV3({
    dots,
    exerciseNum,
    totalExercises,
    completedSets,
    requiredSets,
    elapsedLabel,
    volumeLabel,
    onExit,
    onSettings,
    onViewAll,
    showViewAll = false,
}: ExecHeaderV3Props) {
    return (
        <div className="exec-v3-header sticky top-0 z-20 pt-safe backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 md:px-8">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onExit}
                        aria-label="Salir"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.06] text-on-dark-muted transition-colors hover:text-on-dark"
                    >
                        <ArrowLeft className="h-[18px] w-[18px]" />
                    </button>

                    <div
                        className="flex flex-1 items-center gap-1.5"
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

                    {showViewAll && onViewAll && (
                        <button
                            type="button"
                            onClick={onViewAll}
                            aria-label="Ver todos los ejercicios"
                            className="flex h-9 shrink-0 items-center gap-1 rounded-[11px] border border-white/10 bg-white/[0.06] px-2.5 text-[11px] font-bold text-on-dark-muted transition-colors hover:text-on-dark"
                        >
                            <List className="h-[15px] w-[15px]" />
                            Ver todo
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onSettings}
                        aria-label="Ajustes del entrenamiento"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.06] text-on-dark-muted transition-colors hover:text-on-dark"
                    >
                        <Settings className="h-[18px] w-[18px]" />
                    </button>
                </div>

                <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-on-dark-muted">
                    <span className="shrink-0 font-bold uppercase tracking-wide text-on-dark">
                        Ejercicio {exerciseNum}{' '}
                        <span className="font-medium text-on-dark-muted">de {totalExercises}</span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-x-1.5">
                        <span className="font-medium">
                            {completedSets}/{requiredSets} series
                        </span>
                        {volumeLabel && (
                            <>
                                <span className="font-medium">·</span>
                                <span className="font-medium">{volumeLabel}</span>
                            </>
                        )}
                        <span className="font-medium">·</span>
                        <span className="font-bold text-on-dark">{elapsedLabel}</span>
                    </span>
                </div>
            </div>
        </div>
    )
}
