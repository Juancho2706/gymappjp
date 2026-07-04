'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { AlertTriangle, ArrowRightLeft, Dumbbell, RotateCw } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { exerciseGridThumb } from '@/lib/exercises/exercise-thumb'
import { equipmentLabel } from '@/services/workout/exercise-substitution'
import { getExerciseSubstitutionsAction } from '../_actions/substitution.actions'
import type { SubstituteCandidate } from '../_data/substitution.queries'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Bloque a sustituir (fuente del candidate set en el server). */
    blockId: string | null
    /** Ejercicio prescrito (contexto del header). */
    prescribedName: string
    muscleGroup: string
    /** Confirmar la elección → swap in-place SOLO de esta sesión (el plan NO se toca). */
    onConfirm: (option: SubstituteCandidate) => void
}

/**
 * Bottom-sheet de sustitución de "máquina ocupada" (Fase L · workstream C, DC-3).
 *
 * Referencias 2026 (Hevy "Replace Exercise": 3-5 alternativas del mismo músculo, swap sólo de la
 * sesión actual · Fitbod: mismo músculo + equipment). Lazy: pide las sugerencias al abrir (evento
 * raro, sin prefetch). Portaleado a `body` → estilo con tokens dark EXPLÍCITOS (`--ink-*`,
 * `text-on-dark`, `--sport-*`) para verse siempre dark como el resto de la exec. `max-h-[85dvh]`
 * con scroll interno; cerrar con Esc/backdrop (base-ui Dialog + focus-trap).
 */
export function SubstituteExerciseSheet({
    open,
    onOpenChange,
    blockId,
    prescribedName,
    muscleGroup,
    onConfirm,
}: Props) {
    const [pending, startTransition] = useTransition()
    const [options, setOptions] = useState<SubstituteCandidate[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = (id: string) => {
        setError(null)
        setOptions(null)
        startTransition(async () => {
            const res = await getExerciseSubstitutionsAction(id)
            if (res.ok) setOptions(res.substitutes)
            else setError(res.error)
        })
    }

    // Pide sugerencias cada vez que se abre para un bloque concreto.
    useEffect(() => {
        if (open && blockId) load(blockId)
        if (!open) {
            setOptions(null)
            setError(null)
        }
    }, [open, blockId])

    const showLoading = pending || (open && options === null && error === null)

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton
                aria-label={`Cambiar ${prescribedName} por máquina ocupada`}
                className="max-h-[85dvh] gap-0 rounded-t-sheet border-t border-[var(--border-inverse)] bg-[var(--ink-950)] p-0 text-on-dark dark:bg-[var(--ink-950)]"
            >
                {/* Grabber + header (objetivo prescrito + aviso "solo por hoy") */}
                <div className="shrink-0 px-5 pt-3 pb-4">
                    <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15" aria-hidden />
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--sport-300)]">
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Cambiar ejercicio
                    </div>
                    <h2 className="mt-1.5 font-display text-[22px] font-black leading-tight tracking-[-0.02em] text-on-dark">
                        {prescribedName}
                    </h2>
                    <p className="mt-1 text-[12px] text-on-dark-muted">
                        {muscleGroup} · Máquina ocupada — el cambio vale <span className="font-semibold text-on-dark">solo por hoy</span> y no toca tu plan.
                    </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
                    {showLoading && (
                        <ul className="space-y-2.5" aria-hidden>
                            {[0, 1, 2, 3].map((i) => (
                                <li key={i} className="flex items-center gap-3 rounded-card border border-[var(--border-inverse)] bg-white/[0.03] p-3">
                                    <div className="h-14 w-14 shrink-0 animate-pulse rounded-control bg-white/[0.06]" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                                        <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.05]" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!showLoading && error && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <AlertTriangle className="h-8 w-8 text-[var(--warning-500,#f59e0b)]" />
                            <p className="text-sm text-on-dark-muted">{error}</p>
                            {blockId && (
                                <button
                                    type="button"
                                    onClick={() => load(blockId)}
                                    className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-control bg-white/[0.06] px-4 text-sm font-bold text-on-dark transition-colors hover:bg-white/[0.12]"
                                >
                                    <RotateCw className="h-4 w-4" /> Reintentar
                                </button>
                            )}
                        </div>
                    )}

                    {!showLoading && !error && options && options.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-on-dark-muted">
                                <Dumbbell className="h-7 w-7" />
                            </div>
                            <p className="text-sm text-on-dark-muted">
                                No encontramos alternativas equivalentes para <span className="font-semibold text-on-dark">{muscleGroup}</span> en tu catálogo.
                            </p>
                        </div>
                    )}

                    {!showLoading && !error && options && options.length > 0 && (
                        <ul className="space-y-2.5" role="list" aria-label={`Alternativas para ${prescribedName}`}>
                            {options.map((opt) => {
                                const thumb = exerciseGridThumb(opt)
                                return (
                                    <li key={opt.id}>
                                        <button
                                            type="button"
                                            onClick={() => onConfirm(opt)}
                                            aria-label={`Usar ${opt.name} (${equipmentLabel(opt.equipment)})`}
                                            className="group flex w-full items-center gap-3 rounded-card border border-[var(--border-inverse)] bg-white/[0.03] p-3 text-left transition-all hover:border-[var(--sport-500)]/50 hover:bg-white/[0.06] active:scale-[0.99]"
                                        >
                                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-white/[0.06]">
                                                {thumb ? (
                                                    <Image
                                                        src={thumb}
                                                        alt={opt.name}
                                                        fill
                                                        sizes="56px"
                                                        className="object-contain p-1"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <span className="flex h-full w-full items-center justify-center text-on-dark-muted">
                                                        <Dumbbell className="h-5 w-5" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-bold text-[15px] leading-tight text-on-dark">{opt.name}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    <span className="inline-flex items-center rounded-full border border-[var(--sport-500)]/30 bg-[var(--sport-500)]/[0.10] px-2 py-0.5 text-[10.5px] font-bold text-[var(--sport-300)]">
                                                        {equipmentLabel(opt.equipment)}
                                                    </span>
                                                    {opt.muscle_group && (
                                                        <span className="text-[11px] text-on-dark-muted">{opt.muscle_group}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span
                                                className={cn(
                                                    'shrink-0 rounded-control px-3 py-2 text-[12px] font-bold transition-colors',
                                                    'bg-[var(--sport-500)]/15 text-[var(--sport-300)] group-hover:bg-[var(--sport-500)] group-hover:text-white',
                                                )}
                                            >
                                                Usar
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
