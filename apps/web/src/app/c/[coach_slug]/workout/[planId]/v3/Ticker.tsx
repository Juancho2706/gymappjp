'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Ejecutor V3 (E4.3) — TICKER que cuenta un número hasta su valor final (easeOutCubic ~0.9 s) y lo
 * pinta con un formateador propio (kg, mm:ss, "24 / 24"…). Sólo arranca cuando `active` pasa a true
 * (la Final V3 lo enciende al entrar en la fase 2), de modo que el conteo acompaña el stagger.
 *
 * Accesibilidad / contrato de motion: con `reducedMotion` (o si `active` nunca llega) muestra el
 * VALOR DIRECTO sin animar — cero movimiento, decisión de la épica.
 */
export interface TickerProps {
    /** Valor final a contar (magnitud numérica; el formateo lo hace `format`). */
    value: number
    /** Convierte el valor intermedio en texto (p. ej. `(n) => \`${Math.round(n)} kg\``). */
    format: (n: number) => string
    /** Enciende el conteo. Falso ⇒ queda en el valor final (o en 0 si aún no arranca sin reduced). */
    active: boolean
    reducedMotion: boolean | null
    durationMs?: number
    className?: string
}

export function Ticker({ value, format, active, reducedMotion, durationMs = 900, className }: TickerProps) {
    // Reduced-motion o valores triviales ⇒ directo. Si no, arranca en 0 hasta que `active`.
    const [display, setDisplay] = useState(() => (reducedMotion ? value : 0))
    const rafRef = useRef<number | null>(null)

    useEffect(() => {
        if (reducedMotion) {
            setDisplay(value)
            return
        }
        if (!active) {
            setDisplay(0)
            return
        }
        const t0 = performance.now()
        const step = (t: number) => {
            const p = Math.min(1, (t - t0) / durationMs)
            const eased = 1 - Math.pow(1 - p, 3)
            setDisplay(value * eased)
            if (p < 1) rafRef.current = requestAnimationFrame(step)
            else setDisplay(value)
        }
        rafRef.current = requestAnimationFrame(step)
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        }
    }, [value, active, reducedMotion, durationMs])

    return (
        <span className={className} aria-label={format(value)}>
            {format(display)}
        </span>
    )
}
