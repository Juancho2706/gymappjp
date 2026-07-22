'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface SessionIntroProps {
    /** Inicial del coach para el avatar (fallback a "•" si no hay identidad disponible). */
    coachInitial?: string | null
    /** Título del día (p. ej. "Día 3 · Empuje"). */
    dayTitle: string
    /** Se llama al auto-avanzar (<1,5 s) o al tocar para saltar. Idempotente vía guard interno. */
    onDone: () => void
    /** Reduced-motion: entrada por fade, sin springs; los loops decorativos los apaga el CSS. */
    reducedMotion: boolean | null
}

/**
 * Ejecutor V3 (E2.2) — pantalla de ENTRADA (splash). Overlay dark-only de <1,5 s montado SÓLO en
 * modo V3, una vez por apertura (el gate de sessionStorage por plan+día vive en el client padre).
 * Traducción del mockup `concepto-a-v3-core` (pantalla Entrada): círculo del coach con halo que late
 * (spring de entrada), nombre del día con overshoot, "Preparando tu sesión" con tres puntos.
 *
 * Skippable con un tap en cualquier parte; auto-avanza a Inicio. Con reduced-motion la entrada es un
 * fade y las animaciones decorativas (halo, spin, dots) quedan apagadas por `prefers-reduced-motion`
 * en globals.css. El acento sale de `--exec-brand` (resuelto por exec-theme.ts en el wrapper V3).
 */
export function SessionIntro({ coachInitial, dayTitle, onDone, reducedMotion }: SessionIntroProps) {
    const doneRef = useRef(false)
    const finish = () => {
        if (doneRef.current) return
        doneRef.current = true
        onDone()
    }

    useEffect(() => {
        // <1,5 s reales: auto-avanza a Inicio. El tap sólo adelanta este mismo cierre.
        const t = window.setTimeout(finish, 1300)
        return () => window.clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const spring = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 18 }

    return (
        <motion.div
            className="exec-v3-splash fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 px-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            role="button"
            tabIndex={0}
            aria-label="Preparando tu sesión — toca para saltar"
            onClick={finish}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    finish()
                }
            }}
        >
            <motion.div
                className="exec-v3-splash-coach"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring}
            >
                <span className="exec-v3-splash-halo" aria-hidden />
                <span className="exec-v3-splash-ring" aria-hidden />
                <span className="exec-v3-splash-av">{coachInitial || '•'}</span>
            </motion.div>

            <motion.div
                className="exec-v3-splash-day"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 16, delay: 0.08 }}
            >
                {dayTitle}
            </motion.div>

            <div className="exec-v3-splash-prep">
                Preparando tu sesión
                <span className="exec-v3-splash-dots" aria-hidden>
                    <i />
                    <i />
                    <i />
                </span>
            </div>

            <span className="exec-v3-splash-skip">Toca para saltar</span>
        </motion.div>
    )
}
