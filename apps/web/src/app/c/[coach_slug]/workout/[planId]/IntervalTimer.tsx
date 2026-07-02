'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Play, Pause, SkipForward, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playTimerSound } from '@/lib/audioUtils'
import { readRestTimerSound, readRestTimerVolume } from './rest-timer-preferences'
import { INTERVAL_PHASE_LABEL, type IntervalPhase } from '@/lib/workout-interval'

interface IntervalTimerProps {
    phases: IntervalPhase[]
    onClose: () => void
}

const PHASE_COLOR: Record<IntervalPhase['kind'], string> = {
    warmup: 'text-sport-300',
    work: 'text-[var(--ember-300)]',
    recovery: 'text-[var(--aqua-500)]',
    cooldown: 'text-sport-300',
}

/**
 * Timer de intervalos (AC5): fases warmup/work/recovery/cooldown con "intervalo N de M",
 * beep Web Audio en cada cambio de fase (primario — iOS no vibra) + vibración refuerzo,
 * y Wake Lock OPCIONAL con toggle visible (requiere gesto del usuario, se re-adquiere en
 * visibilitychange y avisa del costo de batería — research del SPEC).
 */
export function IntervalTimer({ phases, onClose }: IntervalTimerProps) {
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [timeLeft, setTimeLeft] = useState(phases[0]?.durationSec ?? 0)
    const [isActive, setIsActive] = useState(true)
    const [finished, setFinished] = useState(false)
    const [wakeLockOn, setWakeLockOn] = useState(false)
    const reducedMotion = useReducedMotion()
    const endTimeRef = useRef<number | null>(null)
    const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
    const phaseIndexRef = useRef(0)

    const phase = phases[phaseIndex] ?? null

    const beep = useCallback((double = false) => {
        playTimerSound(readRestTimerSound(), readRestTimerVolume())
        if ('vibrate' in navigator) {
            navigator.vibrate(double ? [200, 100, 200, 100, 400] : [200, 100, 200])
        }
    }, [])

    const advance = useCallback(() => {
        const next = phaseIndexRef.current + 1
        if (next >= phases.length) {
            beep(true)
            setFinished(true)
            setIsActive(false)
            endTimeRef.current = null
            return
        }
        beep(false)
        phaseIndexRef.current = next
        setPhaseIndex(next)
        setTimeLeft(phases[next].durationSec)
        endTimeRef.current = Date.now() + phases[next].durationSec * 1000
    }, [phases, beep])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive && !finished) {
            if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
            interval = setInterval(() => {
                if (!endTimeRef.current) return
                const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
                setTimeLeft(next)
                if (next === 0) advance()
            }, 250)
        } else if (!isActive) {
            endTimeRef.current = null
        }
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, finished, phaseIndex, advance])

    // Wake Lock con toggle (gesto del usuario) + re-adquisición en visibilitychange
    const acquireWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator && document.visibilityState === 'visible') {
                wakeLockRef.current = await navigator.wakeLock.request('screen')
            }
        } catch {
            // Wake Lock no disponible (batería baja / navegador) — el timer sigue normal
        }
    }, [])

    const toggleWakeLock = useCallback(async () => {
        if (wakeLockOn) {
            setWakeLockOn(false)
            await wakeLockRef.current?.release().catch(() => undefined)
            wakeLockRef.current = null
        } else {
            setWakeLockOn(true)
            await acquireWakeLock()
        }
    }, [wakeLockOn, acquireWakeLock])

    useEffect(() => {
        if (!wakeLockOn) return
        const onVisibility = () => {
            if (document.visibilityState === 'visible') void acquireWakeLock()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            wakeLockRef.current?.release().catch(() => undefined)
            wakeLockRef.current = null
        }
    }, [wakeLockOn, acquireWakeLock])

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

    return (
        <AnimatePresence>
            <motion.div
                initial={reducedMotion ? false : { y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reducedMotion ? undefined : { y: -24, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed z-50 left-3 right-3 md:left-auto md:right-6 md:w-[340px] top-[calc(env(safe-area-inset-top,0px)+6.25rem)] md:top-4 bg-[var(--ink-900)]/95 backdrop-blur-xl border border-[var(--border-inverse)] shadow-lg rounded-2xl px-3 py-2.5 overflow-hidden"
            >
                <div className="flex items-center justify-between gap-2 min-h-11">
                    <div className="min-w-0 flex-1">
                        {finished ? (
                            <p className="text-sm font-bold text-[var(--success-500)]">¡Intervalos completados!</p>
                        ) : (
                            <>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${phase ? PHASE_COLOR[phase.kind] : ''}`}>
                                    {phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
                                    {phase?.repeat != null && phase.totalRepeats != null && (
                                        <span className="text-on-dark-muted font-bold"> · intervalo {phase.repeat} de {phase.totalRepeats}</span>
                                    )}
                                </p>
                                <p className="text-2xl font-black tabular-nums text-on-dark leading-tight">
                                    {formatTime(timeLeft)}
                                </p>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-11 w-11 md:h-8 md:w-8 rounded-full ${wakeLockOn ? 'text-[var(--warning-500)] bg-[var(--warning-500)]/10' : 'text-on-dark-muted hover:text-on-dark hover:bg-white/10'}`}
                            onClick={toggleWakeLock}
                            title={wakeLockOn ? 'Pantalla siempre encendida: ON (gasta más batería)' : 'Mantener pantalla encendida'}
                            aria-label="Mantener pantalla encendida"
                            aria-pressed={wakeLockOn}
                        >
                            <Sun className="w-3.5 h-3.5" />
                        </Button>
                        {!finished && (
                            <>
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
                                    onClick={advance}
                                    title="Saltar fase"
                                    aria-label="Saltar fase"
                                >
                                    <SkipForward className="w-3.5 h-3.5" />
                                </Button>
                            </>
                        )}
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
                {/* Barra de progreso de la fase actual */}
                {!finished && phase && (
                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-300 ease-linear"
                            style={{
                                backgroundColor: phase.kind === 'work' ? 'var(--ember-500)' : 'var(--theme-primary)',
                                width: `${phase.durationSec > 0 ? ((phase.durationSec - timeLeft) / phase.durationSec) * 100 : 0}%`,
                            }}
                        />
                    </div>
                )}
                {wakeLockOn && (
                    <p className="mt-1 text-[9px] text-on-dark-muted">
                        Pantalla siempre encendida activa — consume más batería.
                    </p>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
