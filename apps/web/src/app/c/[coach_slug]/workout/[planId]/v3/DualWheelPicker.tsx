'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { formatWeightEsCl } from '@eva/workout-engine'
import { buildWheelRange, nearestWheelIndex, WHEEL_KG_SPEC, WHEEL_REPS_SPEC } from './wheel-range'

/**
 * Vibración de un paso — SOLO si el navegador la soporta (Android Chrome; iOS Safari es no-op).
 * Throttle a 35ms (igual que el espejo RN): en un flick rápido se cruzan ~10-20 topes; sin throttle
 * eso serían 10-20 `vibrate` por giro (jank). Ver informe 14 · causa C.
 */
let lastTickAt = 0
function wheelTick() {
    const now = Date.now()
    if (now - lastTickAt < 35) return
    lastTickAt = now
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
    } catch {
        /* sin soporte: silencioso */
    }
}

/** Alto de cada tope de la rueda (px). 5 visibles ⇒ contenedor 5×. Tap target del tope ≥44px. */
const ITEM_H = 46
const VISIBLE = 5

/** Formateadores estables (módulo) — no recrean la lista memoizada de topes por render. */
const fmtKg = (n: number) => formatWeightEsCl(n)
const fmtReps = (n: number) => String(n)

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
    /** Aditivos (mockup a3c): título "Serie N" + subtítulo "{ejercicio} · N de M". Sin ellos → título genérico. */
    setNumber?: number
    exerciseName?: string
    totalSets?: number
}

/**
 * Rueda de captura dual (E2.5) — decisión CEO 8: mantener presionado el valor abre esta rueda doble
 * kg|reps estilo iOS, centrada en el valor anterior, rango completo, tick háptico. 100% CUSTOM (sin
 * dependencias): dos columnas con scroll-snap sobre un BOTTOM SHEET (mockup `.a3c-sheet`), cápsula
 * central con borde `--exec-brand`. NO toca el guardado — sólo PRODUCE dos valores y los entrega por
 * `onDone`, que el `LogSetForm` escribe en los inputs por el MISMO camino que el autollenado "Anterior".
 *
 * Presentación (informe 10 + 14): sheet anclado abajo (no Dialog centrado), backdrop plano SIN
 * `backdrop-filter` (perf móvil), índice vivo en ref + resaltado directo del DOM al girar (sin
 * re-render del árbol por cada tope), items memoizados, acento resuelto en efecto (no en render).
 */
export function DualWheelPicker({
    open,
    onOpenChange,
    initialWeight,
    initialReps,
    onDone,
    reducedMotion,
    setNumber,
    exerciseName,
    totalSets,
}: DualWheelPickerProps) {
    // Rango COMPLETO y fijo (kg 0-400 · reps 0-100, decisión CEO QA4): no depende del anterior, así que
    // se construye una sola vez. El anterior sólo fija la posición inicial (kgStart/repsStart).
    const kgRange = useMemo(() => buildWheelRange(WHEEL_KG_SPEC), [])
    const repsRange = useMemo(() => buildWheelRange(WHEEL_REPS_SPEC), [])

    const kgStart = useMemo(() => nearestWheelIndex(kgRange, initialWeight), [kgRange, initialWeight])
    const repsStart = useMemo(() => nearestWheelIndex(repsRange, initialReps), [repsRange, initialReps])

    // Índice vivo por columna en refs: NO dispara re-render del padre al girar (informe 14 · causa C).
    // Las columnas se remontan por `key` al abrir para recentrar el scroll en el valor anterior.
    const kgIdxRef = useRef(kgStart)
    const repsIdxRef = useRef(repsStart)
    const setKgIdx = useCallback((i: number) => {
        kgIdxRef.current = i
    }, [])
    const setRepsIdx = useCallback((i: number) => {
        repsIdxRef.current = i
    }, [])
    useEffect(() => {
        if (!open) return
        kgIdxRef.current = kgStart
        repsIdxRef.current = repsStart
    }, [open, kgStart, repsStart])

    // Acento del ejecutor (coach/EVA): el sheet portalea a <body> (fuera de [data-exec-v3]), así que
    // copiamos `--exec-brand` resuelto del árbol del ejecutor. Se lee en EFECTO (no en render) para no
    // forzar un style-flush en el commit (informe 14 · causa D). Fallback sport-500 vía CSS.
    const [accent, setAccent] = useState<string>()
    useEffect(() => {
        if (!open || typeof document === 'undefined') return
        const root = document.querySelector('[data-exec-v3]')
        if (!root) return
        const v = getComputedStyle(root).getPropertyValue('--exec-brand').trim()
        if (v) setAccent(v)
    }, [open])

    const title = setNumber != null ? `Serie ${setNumber}` : 'Ajustar peso y reps'
    const subtitle =
        exerciseName && setNumber != null && totalSets != null
            ? `${exerciseName} · ${setNumber} de ${totalSets}`
            : exerciseName || null

    const confirm = () => {
        const w = kgRange[kgIdxRef.current]
        const r = repsRange[repsIdxRef.current]
        if (w == null || r == null) {
            onOpenChange(false)
            return
        }
        onDone(w, r)
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Backdrop className="exec-wheel-backdrop" />
                <DialogPrimitive.Popup
                    className="exec-wheel-sheet"
                    style={accent ? ({ ['--exec-brand' as string]: accent } as React.CSSProperties) : undefined}
                >
                    <div className="exec-wheel-handle" aria-hidden />
                    <div className="exec-wheel-sheethd">
                        <DialogPrimitive.Title className="exec-wheel-title">{title}</DialogPrimitive.Title>
                        {subtitle && <span className="exec-wheel-subtitle">{subtitle}</span>}
                    </div>

                    <div className="exec-wheel-head" aria-hidden>
                        <span className="exec-wheel-lbl">Kg</span>
                        <span className="exec-wheel-lbl">Reps</span>
                    </div>
                    <div className="exec-wheel-wrap" style={{ height: ITEM_H * VISIBLE }}>
                        <div className="exec-wheel-cap" aria-hidden style={{ height: ITEM_H, marginTop: -(ITEM_H / 2) }} />
                        <WheelColumn
                            key={`kg-${open}-${initialWeight}`}
                            label="Kg"
                            range={kgRange}
                            initialIndex={kgStart}
                            onIndex={setKgIdx}
                            format={fmtKg}
                            reducedMotion={reducedMotion}
                        />
                        <WheelColumn
                            key={`reps-${open}-${initialReps}`}
                            label="Reps"
                            range={repsRange}
                            initialIndex={repsStart}
                            onIndex={setRepsIdx}
                            format={fmtReps}
                            reducedMotion={reducedMotion}
                        />
                    </div>

                    <div className="exec-wheel-note">
                        Centrada en tu valor anterior · <b>tick háptico</b> por paso
                    </div>

                    <button type="button" onClick={confirm} className="exec-wheel-done">
                        <span className="exec-wheel-done-ck" aria-hidden /> Listo
                    </button>
                </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

interface WheelColumnProps {
    label: string
    range: number[]
    initialIndex: number
    onIndex: (i: number) => void
    format: (n: number) => string
    reducedMotion: boolean | null
}

/**
 * Columna de la rueda: scroll-snap vertical con cápsula central fija. El resaltado (tope central 27px +
 * profundidad graduada de vecinos) se pinta por MANIPULACIÓN DIRECTA del DOM en el scroll (atributo
 * `data-dist` por item) — SIN setState ni re-render del árbol (informe 14 · causa C). Los items se
 * renderizan UNA vez (memoizados); la columna está envuelta en `memo` para que el padre no la reconcilie.
 */
const WheelColumn = memo(function WheelColumn({ label, range, initialIndex, onIndex, format, reducedMotion }: WheelColumnProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
    const lastIdxRef = useRef(initialIndex)
    const rafRef = useRef<number | null>(null)
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Pinta la profundidad de la rueda (data-dist 0/1/2 por distancia al centro) SIN re-render.
    const paint = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const center = el.scrollTop / ITEM_H
        const items = itemsRef.current
        for (let i = 0; i < items.length; i++) {
            const b = items[i]
            if (!b) continue
            const d = Math.min(2, Math.round(Math.abs(i - center)))
            const next = String(d)
            if (b.getAttribute('data-dist') !== next) b.setAttribute('data-dist', next)
        }
    }, [])

    const commit = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const raw = Math.round(el.scrollTop / ITEM_H)
        const clamped = Math.max(0, Math.min(range.length - 1, raw))
        if (clamped !== lastIdxRef.current) {
            lastIdxRef.current = clamped
            wheelTick()
            onIndex(clamped)
            const items = itemsRef.current
            for (let i = 0; i < items.length; i++) {
                items[i]?.setAttribute('aria-selected', i === clamped ? 'true' : 'false')
            }
        }
    }, [range.length, onIndex])

    const onScroll = useCallback(() => {
        // Marca en vivo bajo la cápsula (rAF para no saturar) + fallback de fin de scroll.
        if (rafRef.current == null) {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                paint()
                commit()
            })
        }
        if (settleRef.current) clearTimeout(settleRef.current)
        settleRef.current = setTimeout(() => {
            paint()
            commit()
        }, 90)
    }, [paint, commit])

    // Posiciona el scroll en el índice inicial al MONTAR (la columna se remonta por `key` al reabrir).
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollTop = initialIndex * ITEM_H
        lastIdxRef.current = initialIndex
        paint()
        const items = itemsRef.current
        for (let i = 0; i < items.length; i++) {
            items[i]?.setAttribute('aria-selected', i === initialIndex ? 'true' : 'false')
        }
    }, [initialIndex, paint])

    useEffect(
        () => () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            if (settleRef.current) clearTimeout(settleRef.current)
        },
        [],
    )

    // Items renderizados UNA vez — nunca se reconcilian durante el giro (closures/estilos estables).
    const items = useMemo(
        () =>
            range.map((value, i) => (
                <button
                    key={value}
                    ref={(node) => {
                        itemsRef.current[i] = node
                    }}
                    type="button"
                    role="option"
                    aria-selected={i === initialIndex}
                    className="exec-wheel-item"
                    style={{ height: ITEM_H }}
                    onClick={() => {
                        scrollRef.current?.scrollTo({ top: i * ITEM_H, behavior: reducedMotion ? 'auto' : 'smooth' })
                    }}
                >
                    {format(value)}
                </button>
            )),
        [range, format, reducedMotion, initialIndex],
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
                {items}
                <div style={{ height: ITEM_H * 2 }} aria-hidden />
            </div>
        </div>
    )
})

interface SingleWheelPickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Valor actual alrededor del cual se centra la rueda. */
    value: number | null
    /** Especificación del rango COMPLETO (contrato QA4) — para pasadas: step 1, 0 a 100. */
    spec: { step: number; max: number; min?: number }
    label: string
    title: string
    subtitle?: string | null
    /** "Listo" entrega el valor elegido; el caller lo escribe por el camino de prefill existente. */
    onDone: (value: number) => void
    reducedMotion: boolean | null
}

/**
 * Rueda de captura de UN valor (QA4 · roller) — MISMA mecánica y estética que la dual (`WheelColumn`
 * reutilizada, bottom sheet, cápsula central, tick háptico), con UNA sola columna. NO toca el guardado:
 * sólo produce un número y lo entrega por `onDone`, que el llamador escribe por el mismo camino de
 * prefill/autollenado existente. La rueda dual queda intacta (este es un componente hermano aditivo).
 */
export function SingleWheelPicker({ open, onOpenChange, value, spec, label, title, subtitle, onDone, reducedMotion }: SingleWheelPickerProps) {
    const range = useMemo(
        () => buildWheelRange({ step: spec.step, min: spec.min ?? 0, max: spec.max }),
        [spec.step, spec.min, spec.max],
    )
    const start = useMemo(() => nearestWheelIndex(range, value), [range, value])
    const idxRef = useRef(start)
    const setIdx = useCallback((i: number) => {
        idxRef.current = i
    }, [])
    useEffect(() => {
        if (open) idxRef.current = start
    }, [open, start])

    const [accent, setAccent] = useState<string>()
    useEffect(() => {
        if (!open || typeof document === 'undefined') return
        const root = document.querySelector('[data-exec-v3]')
        if (!root) return
        const v = getComputedStyle(root).getPropertyValue('--exec-brand').trim()
        if (v) setAccent(v)
    }, [open])

    const confirm = () => {
        const picked = range[idxRef.current]
        if (picked == null) {
            onOpenChange(false)
            return
        }
        onDone(picked)
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Backdrop className="exec-wheel-backdrop" />
                <DialogPrimitive.Popup
                    className="exec-wheel-sheet"
                    style={accent ? ({ ['--exec-brand' as string]: accent } as React.CSSProperties) : undefined}
                >
                    <div className="exec-wheel-handle" aria-hidden />
                    <div className="exec-wheel-sheethd">
                        <DialogPrimitive.Title className="exec-wheel-title">{title}</DialogPrimitive.Title>
                        {subtitle && <span className="exec-wheel-subtitle">{subtitle}</span>}
                    </div>
                    <div className="exec-wheel-head" aria-hidden>
                        <span className="exec-wheel-lbl">{label}</span>
                    </div>
                    <div className="exec-wheel-wrap" style={{ height: ITEM_H * VISIBLE }}>
                        <div className="exec-wheel-cap" aria-hidden style={{ height: ITEM_H, marginTop: -(ITEM_H / 2) }} />
                        <WheelColumn
                            key={`single-${open}-${value}`}
                            label={label}
                            range={range}
                            initialIndex={start}
                            onIndex={setIdx}
                            format={fmtReps}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                    <div className="exec-wheel-note">
                        Centrada en tu valor actual · <b>tick háptico</b> por paso
                    </div>
                    <button type="button" onClick={confirm} className="exec-wheel-done">
                        <span className="exec-wheel-done-ck" aria-hidden /> Listo
                    </button>
                </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
