'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Play, Pause, RotateCcw, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StopwatchProps {
    onClose: () => void
}

/** Cronómetro count-up con vueltas (AC5) — cardio continuo / por distancia. */
export function Stopwatch({ onClose }: StopwatchProps) {
    const [elapsed, setElapsed] = useState(0)
    const [isActive, setIsActive] = useState(true)
    const [laps, setLaps] = useState<number[]>([])
    const reducedMotion = useReducedMotion()
    // El effect reasigna startRef.current = Date.now() antes del primer tick (isActive default true),
    // así que el seed no se lee nunca; sembrar 0 mantiene el render puro (Date.now() en render es impuro).
    const startRef = useRef<number>(0)
    const accumulatedRef = useRef(0)

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive) {
            startRef.current = Date.now()
            interval = setInterval(() => {
                setElapsed(accumulatedRef.current + Math.floor((Date.now() - startRef.current) / 1000))
            }, 250)
        }
        return () => clearInterval(interval)
    }, [isActive])

    const togglePause = () => {
        if (isActive) {
            accumulatedRef.current += Math.floor((Date.now() - startRef.current) / 1000)
        }
        setIsActive((v) => !v)
    }

    const reset = () => {
        accumulatedRef.current = 0
        startRef.current = Date.now()
        setElapsed(0)
        setLaps([])
    }

    const addLap = () => setLaps((prev) => [elapsed, ...prev].slice(0, 5))

    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
            : `${m}:${String(sec).padStart(2, '0')}`
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={reducedMotion ? false : { y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reducedMotion ? undefined : { y: -24, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed z-50 left-3 right-3 md:left-auto md:right-6 md:w-[300px] top-[calc(env(safe-area-inset-top,0px)+6.25rem)] md:top-4 bg-[var(--ink-900)]/95 backdrop-blur-xl border border-[var(--border-inverse)] shadow-lg rounded-2xl px-3 py-2.5 overflow-hidden"
            >
                <div className="flex items-center justify-between gap-2 min-h-11">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-on-dark-muted font-semibold uppercase tracking-wider">Cronómetro</p>
                        <p className="text-2xl font-black tabular-nums text-on-dark leading-tight">{formatTime(elapsed)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={addLap}
                            title="Marcar vuelta"
                            aria-label="Marcar vuelta"
                        >
                            <Flag className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={togglePause}
                            aria-label={isActive ? 'Pausar' : 'Reanudar'}
                        >
                            {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={reset}
                            aria-label="Reiniciar"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 rounded-full text-on-dark-muted hover:text-on-dark hover:bg-white/10"
                            onClick={onClose}
                            aria-label="Cerrar cronómetro"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
                {laps.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {laps.map((lap, i) => (
                            <span key={`${lap}-${i}`} className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/[0.06] text-on-dark-muted">
                                V{laps.length - i}: {formatTime(lap)}
                            </span>
                        ))}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
