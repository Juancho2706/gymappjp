'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Play, Pause, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playTimerSound } from '@/lib/audioUtils'
import { triggerHaptic } from '@/lib/client/haptics'
import { readRestTimerSound, readRestTimerVolume } from './rest-timer-preferences'

interface HoldTimerProps {
    initialSeconds: number
    label?: string
    onClose: () => void
}

/**
 * Timer de hold (movilidad/roller — AC5): cuenta regresiva con beep Web Audio al llegar a 0
 * (canal primario — iOS no vibra) + vibración como refuerzo, y botón Repetir para el
 * siguiente set o lado. Mismo lenguaje visual que RestTimer; respeta safe-area.
 */
export function HoldTimer({ initialSeconds, label, onClose }: HoldTimerProps) {
    const [timeLeft, setTimeLeft] = useState(initialSeconds)
    const [isActive, setIsActive] = useState(true)
    const reducedMotion = useReducedMotion()
    const endTimeRef = useRef<number | null>(null)
    const firedRef = useRef(false)

    const triggerDone = useCallback(() => {
        if (firedRef.current) return
        firedRef.current = true
        // Beep primario (gesto previo del usuario ya desbloqueó Web Audio) + vibración refuerzo
        playTimerSound(readRestTimerSound(), readRestTimerVolume())
        triggerHaptic([200, 100, 400])
        setIsActive(false)
        endTimeRef.current = null
    }, [])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive && timeLeft > 0) {
            if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
            interval = setInterval(() => {
                if (endTimeRef.current) {
                    const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
                    setTimeLeft(next)
                    if (next === 0) triggerDone()
                }
            }, 250)
        } else if (!isActive) {
            endTimeRef.current = null
        }
        return () => clearInterval(interval)
    }, [isActive, timeLeft, triggerDone])

    const restart = () => {
        firedRef.current = false
        endTimeRef.current = null
        setTimeLeft(initialSeconds)
        setIsActive(true)
    }

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    const denom = initialSeconds || 1
    const pct = (timeLeft / denom) * 100
    const dashOffset = 176 - (176 * Math.min(100, pct)) / 100

    return (
        <AnimatePresence>
            <motion.div
                initial={reducedMotion ? false : { y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reducedMotion ? undefined : { y: -24, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed z-50 left-3 right-3 md:left-auto md:right-6 md:w-[300px] top-[calc(env(safe-area-inset-top,0px)+6.25rem)] md:top-4 bg-[var(--ink-900)]/95 backdrop-blur-xl border border-[var(--border-inverse)] shadow-lg rounded-2xl px-2.5 py-2 overflow-hidden"
            >
                {timeLeft === 0 && (
                    <div className="absolute inset-0 bg-[var(--ember-500)]/15 z-0 pointer-events-none" />
                )}
                <div className="relative z-10 flex items-center justify-between gap-1.5 min-h-11">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                            <svg className="w-11 h-11 transform -rotate-90" viewBox="0 0 44 44">
                                <circle cx="22" cy="22" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-white/10" />
                                <circle
                                    cx="22" cy="22" r="18"
                                    stroke="var(--ember-500)"
                                    strokeWidth="3"
                                    fill="transparent"
                                    strokeDasharray="176"
                                    strokeDashoffset={dashOffset}
                                    className="transition-all duration-300 ease-linear"
                                />
                            </svg>
                            <span className="absolute text-xs font-bold tabular-nums text-on-dark">{formatTime(timeLeft)}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <p className="text-[10px] text-on-dark-muted font-semibold uppercase tracking-wider truncate">
                                {label || 'Hold'}
                            </p>
                            <p className="text-xs font-bold text-on-dark truncate">
                                {timeLeft === 0 ? '¡Listo! Cambia de lado o set' : 'Mantén la posición'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={() => setIsActive((v) => !v)}
                            aria-label={isActive ? 'Pausar' : 'Reanudar'}
                        >
                            {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={restart}
                            title="Repetir (siguiente set o lado)"
                            aria-label="Repetir hold"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={onClose}
                            aria-label="Cerrar timer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
