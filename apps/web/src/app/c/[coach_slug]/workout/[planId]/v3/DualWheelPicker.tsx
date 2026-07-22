'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatWeightEsCl } from '@eva/workout-engine'
import { buildWheelRange, nearestWheelIndex, WHEEL_KG_SPEC, WHEEL_REPS_SPEC } from './wheel-range'

/** Vibración de un paso — SOLO si el navegador la soporta (Android Chrome; iOS Safari es no-op). */
function wheelTick() {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
    } catch {
        /* sin soporte: silencioso */
    }
}

/** Alto de cada tope de la rueda (px). 5 visibles ⇒ contenedor 5×. Tap target del tope ≥44px. */
const ITEM_H = 46
const VISIBLE = 5

interface DualWheelPickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Valor anterior de peso (kg) — centra la columna kg. */
    initialWeight: number | null
    /** Valor anterior de reps — centra la columna reps. */
    initialReps: number | null
    /** "Listo" entrega ambos valores; el caller los escribe en los inputs (camino del autollenado). */
    onDone: (weightKg: number, reps: number) => void
    reducedMotion: boolean | null
}

/**
 * Rueda de captura dual (E2.5) — decisión CEO 8: mantener presionado el valor abre esta rueda doble
 * kg|reps estilo iOS, centrada en el valor anterior, rango corto, tick háptico. 100% CUSTOM (sin
 * dependencias): dos columnas con CSS scroll-snap, cápsula central con borde `--exec-brand`. NO toca
 * el guardado — sólo PRODUCE dos valores y los entrega por `onDone`, que el `LogSetForm` escribe en
 * los inputs por el MISMO camino que el autollenado "Anterior" (evento `input` nativo → drafts intactos).
 */
export function DualWheelPicker({
    open,
    onOpenChange,
    initialWeight,
    initialReps,
    onDone,
    reducedMotion,
}: DualWheelPickerProps) {
    const kgRange = useMemo(() => buildWheelRange({ center: initialWeight, ...WHEEL_KG_SPEC }), [initialWeight])
    const repsRange = useMemo(() => buildWheelRange({ center: initialReps, ...WHEEL_REPS_SPEC }), [initialReps])
    const [kgIdx, setKgIdx] = useState(() => nearestWheelIndex(kgRange, initialWeight))
    const [repsIdx, setRepsIdx] = useState(() => nearestWheelIndex(repsRange, initialReps))

    // Reposiciona en el anterior cada vez que se abre (los inputs pudieron cambiar entre aperturas).
    useEffect(() => {
        if (!open) return
        setKgIdx(nearestWheelIndex(kgRange, initialWeight))
        setRepsIdx(nearestWheelIndex(repsRange, initialReps))
    }, [open, kgRange, repsRange, initialWeight, initialReps])

    // Acento del ejecutor (coach/EVA): el diálogo portalea a <body> (fuera de [data-exec-v3]), así que
    // copiamos `--exec-brand` resuelto del árbol del ejecutor a la raíz del diálogo (fallback sport-500).
    const accent = useMemo(() => {
        if (!open || typeof document === 'undefined') return undefined
        const root = document.querySelector('[data-exec-v3]')
        if (!root) return undefined
        const v = getComputedStyle(root).getPropertyValue('--exec-brand').trim()
        return v || undefined
    }, [open])

    const confirm = () => {
        const w = kgRange[kgIdx]
        const r = repsRange[repsIdx]
        if (w == null || r == null) {
            onOpenChange(false)
            return
        }
        onDone(w, r)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="exec-wheel-dialog max-w-xs rounded-sheet border-[var(--border-inverse)] bg-[var(--ink-950)] p-5"
                style={accent ? ({ ['--exec-brand' as string]: accent } as React.CSSProperties) : undefined}
            >
                <DialogHeader>
                    <DialogTitle className="text-center font-display text-base font-bold text-on-dark">
                        Ajustar peso y reps
                    </DialogTitle>
                </DialogHeader>

                <div className="exec-wheel-head" aria-hidden>
                    <span className="exec-wheel-lbl">Kg</span>
                    <span className="exec-wheel-lbl">Reps</span>
                </div>
                <div className="exec-wheel-wrap" style={{ height: ITEM_H * VISIBLE }}>
                    <div className="exec-wheel-cap" aria-hidden style={{ height: ITEM_H, marginTop: -(ITEM_H / 2) }} />
                    <div className="exec-wheel-x" aria-hidden>
                        ×
                    </div>
                    <WheelColumn
                        label="Kg"
                        range={kgRange}
                        index={kgIdx}
                        onIndex={setKgIdx}
                        format={(n) => formatWeightEsCl(n)}
                        reducedMotion={reducedMotion}
                    />
                    <WheelColumn
                        label="Reps"
                        range={repsRange}
                        index={repsIdx}
                        onIndex={setRepsIdx}
                        format={(n) => String(n)}
                        reducedMotion={reducedMotion}
                    />
                </div>

                <button
                    type="button"
                    onClick={confirm}
                    className="exec-wheel-done mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-control text-[15px] font-bold text-white"
                >
                    <Check className="h-5 w-5" /> Listo
                </button>
            </DialogContent>
        </Dialog>
    )
}

interface WheelColumnProps {
    label: string
    range: number[]
    index: number
    onIndex: (i: number) => void
    format: (n: number) => string
    reducedMotion: boolean | null
}

/**
 * Columna de la rueda: scroll-snap vertical con cápsula central. Al soltar el scroll, el tope
 * snapeado se marca (índice = round(scrollTop / alto)); un tick háptico por cada paso cruzado.
 * Tap en un tope lo lleva al centro. reduced-motion ⇒ `scroll-behavior: auto`.
 */
function WheelColumn({ label, range, index, onIndex, format, reducedMotion }: WheelColumnProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const lastIdxRef = useRef(index)
    const rafRef = useRef<number | null>(null)
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Posiciona el scroll en el índice inicial al montar / cambiar el índice desde fuera (reapertura).
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const top = index * ITEM_H
        if (Math.round(el.scrollTop / ITEM_H) !== index) {
            el.scrollTo({ top, behavior: 'auto' })
        }
        lastIdxRef.current = index
    }, [index, range.length])

    const commitFromScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const raw = Math.round(el.scrollTop / ITEM_H)
        const clamped = Math.max(0, Math.min(range.length - 1, raw))
        if (clamped !== lastIdxRef.current) {
            lastIdxRef.current = clamped
            wheelTick()
            onIndex(clamped)
        }
    }, [range.length, onIndex])

    const onScroll = useCallback(() => {
        // Marca en vivo el tope bajo la cápsula (rAF para no saturar) + fallback de fin de scroll.
        if (rafRef.current == null) {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                commitFromScroll()
            })
        }
        if (settleRef.current) clearTimeout(settleRef.current)
        settleRef.current = setTimeout(commitFromScroll, 90)
    }, [commitFromScroll])

    useEffect(
        () => () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            if (settleRef.current) clearTimeout(settleRef.current)
        },
        [],
    )

    return (
        <div className="exec-wheel-col">
            <div
                ref={scrollRef}
                className="exec-wheel-scroll"
                role="listbox"
                aria-label={`${label} — desliza para elegir`}
                tabIndex={0}
                style={{ height: ITEM_H * VISIBLE, scrollBehavior: reducedMotion ? 'auto' : undefined }}
                onScroll={onScroll}
            >
                {/* Relleno superior/inferior de 2 topes para que el primero/último pueda centrarse. */}
                <div style={{ height: ITEM_H * 2 }} aria-hidden />
                {range.map((value, i) => {
                    const selected = i === index
                    return (
                        <button
                            key={value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                                scrollRef.current?.scrollTo({
                                    top: i * ITEM_H,
                                    behavior: reducedMotion ? 'auto' : 'smooth',
                                })
                                onIndex(i)
                            }}
                            className="exec-wheel-item"
                            style={{ height: ITEM_H }}
                            data-selected={selected ? '' : undefined}
                        >
                            {format(value)}
                        </button>
                    )
                })}
                <div style={{ height: ITEM_H * 2 }} aria-hidden />
            </div>
        </div>
    )
}
