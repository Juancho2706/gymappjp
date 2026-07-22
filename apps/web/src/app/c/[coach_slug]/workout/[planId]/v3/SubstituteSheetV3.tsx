'use client'

/**
 * Ejecutor V3 (Unidad B2 · QA1) — sheet "Máquina ocupada" (sustitución) re-pieleado del mockup
 * `concepto-a-v32-estados` (pantalla 2). Reemplazo 1:1 del `_components/SubstituteExerciseSheet`
 * legacy: MISMO contrato de props (`open`/`onOpenChange`/`blockId`/`prescribedName`/`muscleGroup`/
 * `onConfirm`) y MISMO data-layer (`getExerciseSubstitutionsAction`, lazy al abrir), para que la
 * integración sea un swap directo del import. Sólo cambia la piel + el patrón de confirmación:
 *
 *  - Título "Máquina ocupada" con badge "?" ámbar (`#f5b04a`, = `--amber-a3d` del mockup).
 *  - Subtítulo "Cambia solo por hoy — mismo músculo".
 *  - Tarjetas de alternativa con selección tipo RADIO (la primera preseleccionada) + check circular
 *    relleno de marca (tinta on-brand `--exec-brand-ink`).
 *  - Confirmación en 2 pasos: elegir tarjeta → CTA juicy "Cambiar por hoy" (60px) llama a `onConfirm`
 *    con el candidato seleccionado (el mismo handler que el legacy, sin tocar el payload/log).
 *  - Nota al pie "Tu coach lo verá en el registro".
 *
 * Se monta DENTRO del wrapper `[data-exec-v3]` (acento `--exec-brand` ya resuelto), sin portal, igual
 * que `SensorSheetV3` / `ExecSettingsSheet`. Dark-only por diseño.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { AlertTriangle, Check, Dumbbell, Info, Repeat, RotateCw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
    /** Ejercicio prescrito (contexto del header / aria). */
    prescribedName: string
    muscleGroup: string
    /** Confirmar la elección → swap in-place SOLO de esta sesión (el plan NO se toca). */
    onConfirm: (option: SubstituteCandidate) => void
}

export function SubstituteSheetV3({ open, onOpenChange, blockId, prescribedName, muscleGroup, onConfirm }: Props) {
    const reducedMotion = useReducedMotion()
    const [pending, startTransition] = useTransition()
    const [options, setOptions] = useState<SubstituteCandidate[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const load = (id: string) => {
        setError(null)
        setOptions(null)
        setSelectedId(null)
        startTransition(async () => {
            const res = await getExerciseSubstitutionsAction(id)
            if (res.ok) setOptions(res.substitutes)
            else setError(res.error)
        })
    }

    // Pide sugerencias cada vez que se abre para un bloque concreto (evento raro, sin prefetch).
    useEffect(() => {
        if (open && blockId) load(blockId)
        if (!open) {
            setOptions(null)
            setError(null)
            setSelectedId(null)
        }
    }, [open, blockId])

    // Preselección: la PRIMERA alternativa queda elegida por defecto (mockup `.a3d-alt.sel`).
    useEffect(() => {
        if (options && options.length > 0) setSelectedId((prev) => prev ?? options[0].id)
    }, [options])

    const showLoading = pending || (open && options === null && error === null)
    const selected = useMemo(
        () => options?.find((o) => o.id === selectedId) ?? null,
        [options, selectedId],
    )

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Cerrar cambio de ejercicio"
                        onClick={() => onOpenChange(false)}
                        className="exec-v3-sheet-scrim"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                    />
                    <motion.div
                        className="exec-v3-settings exec-v3-subst"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Cambiar ${prescribedName} por máquina ocupada`}
                        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                    >
                        <span className="exec-v3-handle" aria-hidden />
                        <h2 className="exec-v3-subst-hd">
                            <span className="exec-v3-subst-q" aria-hidden>?</span>
                            Máquina ocupada
                        </h2>
                        <p className="exec-v3-subst-sub">Cambia solo por hoy — mismo músculo</p>

                        {showLoading && (
                            <div className="exec-v3-subst-list" aria-hidden>
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="exec-v3-subst-skel">
                                        <div className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-[13px] bg-white/[0.06]" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                                            <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.05]" />
                                        </div>
                                        <div className="h-[26px] w-[26px] shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {!showLoading && error && (
                            <div className="exec-v3-subst-state">
                                <AlertTriangle className="h-8 w-8 text-[#f5b04a]" aria-hidden />
                                <p>{error}</p>
                                {blockId && (
                                    <button
                                        type="button"
                                        onClick={() => load(blockId)}
                                        className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[#2f2f3a] bg-[#1c1c24] px-4 text-sm font-bold text-[#f4f4f6] transition-colors hover:bg-[#26262f]"
                                    >
                                        <RotateCw className="h-4 w-4" aria-hidden /> Reintentar
                                    </button>
                                )}
                            </div>
                        )}

                        {!showLoading && !error && options && options.length === 0 && (
                            <div className="exec-v3-subst-state">
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-[#8f8f9c]">
                                    <Dumbbell className="h-7 w-7" aria-hidden />
                                </span>
                                <p>
                                    No encontramos alternativas equivalentes para{' '}
                                    <span className="font-bold text-[#eef0f2]">{muscleGroup}</span> en tu catálogo.
                                </p>
                            </div>
                        )}

                        {!showLoading && !error && options && options.length > 0 && (
                            <>
                                <div
                                    className="exec-v3-subst-list"
                                    role="radiogroup"
                                    aria-label={`Alternativas para ${prescribedName}`}
                                >
                                    {options.map((opt) => {
                                        const thumb = exerciseGridThumb(opt)
                                        const isSel = opt.id === selectedId
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={isSel}
                                                onClick={() => setSelectedId(opt.id)}
                                                className={cn('exec-v3-subst-alt', isSel && 'is-sel')}
                                            >
                                                <span className="exec-v3-subst-media">
                                                    {thumb ? (
                                                        <Image
                                                            src={thumb}
                                                            alt=""
                                                            fill
                                                            sizes="52px"
                                                            className="object-contain p-1"
                                                            unoptimized
                                                        />
                                                    ) : (
                                                        <Dumbbell className="h-5 w-5" aria-hidden />
                                                    )}
                                                </span>
                                                <span className="exec-v3-subst-info">
                                                    <span className="an block">{opt.name}</span>
                                                    <span className="ad block">
                                                        {equipmentLabel(opt.equipment)}
                                                        {opt.muscle_group ? ` · ${opt.muscle_group}` : ''}
                                                    </span>
                                                </span>
                                                <span className="exec-v3-subst-check">
                                                    <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden />
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>

                                <button
                                    type="button"
                                    disabled={!selected}
                                    onClick={() => selected && onConfirm(selected)}
                                    className="exec-v3-juicy exec-v3-subst-cta"
                                >
                                    <Repeat className="h-5 w-5" aria-hidden />
                                    Cambiar por hoy
                                </button>
                                <p className="exec-v3-subst-note">
                                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Tu coach lo verá en el registro
                                </p>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
