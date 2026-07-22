'use client'

import Link from 'next/link'
import { SquarePen, RotateCcw, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'

/**
 * Sheet de "doble intención" al tocar un día YA HECHO en OTRO día de la semana (mockup v3.3). El
 * alumno elige entre CORREGIR los registros de esa fecha (editar, jamás duplica) o REPETIR hoy como
 * instancia nueva. Nivel dashboard → claro/oscuro + responsive (reusa el bottom-sheet del DS).
 *
 * Presentacional puro: las URLs las construye el caller con `buildWorkoutEditHref`/`buildWorkoutRepeatHref`
 * (helpers puros testeables). Navegar cierra el sheet solo; "Cancelar" y el backdrop también.
 */
export function WorkoutDoneSheet({
    open,
    onOpenChange,
    title,
    subtitle,
    editHref,
    repeatHref,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Nombre del entreno (título del plan). */
    title: string
    /** "Martes — Día 2 · 15 jul" (label del día + fecha). */
    subtitle: string
    editHref: string
    repeatHref: string
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[85dvh] gap-0 rounded-t-sheet p-0 sm:max-w-md"
                aria-label="Ya hiciste este entrenamiento"
            >
                <div className="flex flex-col gap-1 px-5 pb-2 pt-4">
                    <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border dark:bg-white/15" aria-hidden />
                    <h2 className="font-display text-xl font-black tracking-tight text-strong">
                        Ya hiciste este entrenamiento
                    </h2>
                    <p className="text-[13px] font-semibold text-muted">
                        <span className="text-strong">{title}</span>
                        {subtitle ? <> · {subtitle}</> : null}
                    </p>
                </div>

                <div className="flex flex-col gap-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
                    {/* Opción destacada: revisar y editar los registros de ESA fecha. */}
                    <Link
                        href={editHref}
                        onClick={() => onOpenChange(false)}
                        className="group flex items-center gap-3.5 rounded-card border-2 border-sport-500/55 bg-sport-100/60 p-4 text-left transition-colors hover:bg-sport-100 dark:bg-sport-500/[0.10] dark:hover:bg-sport-500/[0.16]"
                    >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sport-500/18 text-sport-600 dark:text-sport-300">
                            <SquarePen className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-black text-strong">Revisar y editar</span>
                            <span className="mt-0.5 block text-xs font-semibold text-muted">
                                Abre tus registros de ese día y corrige lo que quieras
                            </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sport-600 transition-transform group-hover:translate-x-0.5 dark:text-sport-300" />
                    </Link>

                    {/* Repetir hoy: instancia nueva; las marcas de esa vez quedan como referencia. */}
                    <Link
                        href={repeatHref}
                        onClick={() => onOpenChange(false)}
                        className="group flex items-center gap-3.5 rounded-card border border-subtle bg-surface-card p-4 text-left transition-colors hover:bg-surface-sunken"
                    >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-subtle">
                            <RotateCcw className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-black text-strong">Repetir hoy</span>
                            <span className="mt-0.5 block text-xs font-semibold text-muted">
                                Empieza de cero; tus marcas de esa vez quedan como referencia
                            </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                    </Link>

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="mt-1 w-full rounded-control py-2.5 text-center text-[13px] font-bold text-muted transition-colors hover:text-strong"
                    >
                        Cancelar
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
