'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'

interface SessionIntroProps {
    /** Inicial del coach para el avatar (fallback a "•" si no hay identidad disponible). */
    coachInitial?: string | null
    /** Título del día (p. ej. "Día 3 · Empuje"). */
    dayTitle: string
    /** Se llama al auto-avanzar (<1,5 s) o al tocar para saltar. Idempotente vía guard interno. */
    onDone: () => void
    /** Reduced-motion: entrada por fade, sin springs; los loops decorativos los apaga el CSS. */
    reducedMotion: boolean | null
    /** ¿Llegamos por el morph de lanzamiento? → el avatar llega ASENTADO (su entrada la hizo el overlay). */
    viaMorph?: boolean
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
export function SessionIntro({ coachInitial, dayTitle, onDone, reducedMotion, viaMorph = false }: SessionIntroProps) {
    const doneRef = useRef(false)
    // QA6: si el coach tiene logo propio, el avatar muestra el LOGO (mismo que usa el morph de
    // lanzamiento → handoff invisible); si no, cae a la inicial como hoy. Se resuelve del wrapper /c
    // (data-logo-url) en cliente para no tocar el motor (WorkoutExecutionClient).
    const rootRef = useRef<HTMLDivElement>(null)
    const [coachLogoUrl, setCoachLogoUrl] = useState<string | null>(null)
    useEffect(() => {
        setCoachLogoUrl(resolveLaunchBrand(rootRef.current).logoUrl)
    }, [])
    // QA8 (handoff del morph): si venimos del morph, el avatar YA hizo su entrada en el overlay —
    // llegar re-animando desde scale 0.3 sería un pop doble. El flag lo consume y pasa el WEC.

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
            ref={rootRef}
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
                initial={viaMorph ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring}
            >
                <span className="exec-v3-splash-halo" aria-hidden />
                <span className="exec-v3-splash-ring" aria-hidden />
                <span className="exec-v3-splash-av">
                    {coachLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coachLogoUrl} alt="" className="exec-v3-splash-av-img" />
                    ) : (
                        coachInitial || '•'
                    )}
                </span>
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
