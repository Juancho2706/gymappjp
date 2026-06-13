'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
    show: boolean
    /** Headline shown over the wave. */
    message?: string
    /**
     * Fill color for the wave + check accent. Defaults to the active brand theme
     * (`var(--theme-primary)`) so it follows each coach's white-label palette.
     */
    accentColor?: string
    onCover?: () => void
    onComplete?: () => void
}

type Phase = 'hidden' | 'entering' | 'showing_check' | 'exiting'

/**
 * Full-screen success celebration overlay (shared, brand-themed, reduced-motion aware).
 *
 * Standard motion: a wave sweeps up to cover the screen, a check + headline pop in,
 * then it sweeps away. With `prefers-reduced-motion` it renders a still, centered
 * check + headline (no wave sweep, no pop), holds briefly, and exits via fade.
 */
export function SuccessWaveOverlay({
    show,
    message = 'Listo',
    accentColor = 'var(--theme-primary)',
    onCover,
    onComplete,
}: Props) {
    const reduce = useReducedMotion()
    const [phase, setPhase] = useState<Phase>('hidden')

    useEffect(() => {
        if (!show) return

        if (reduce) {
            // Static: no wave sweep, just reveal the check and hold.
            setPhase('showing_check')
            if (onCover) onCover()
            const tExit = setTimeout(() => setPhase('exiting'), 1400)
            const tDone = setTimeout(() => {
                setPhase('hidden')
                if (onComplete) onComplete()
            }, 1700)
            return () => {
                clearTimeout(tExit)
                clearTimeout(tDone)
            }
        }

        setPhase('entering')

        const t1 = setTimeout(() => {
            setPhase('showing_check')
            if (onCover) onCover() // navigate / mutate once covered
        }, 600) // wave rises and covers

        const t2 = setTimeout(() => setPhase('exiting'), 2200)

        const t3 = setTimeout(() => {
            setPhase('hidden')
            if (onComplete) onComplete()
        }, 2800)

        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
            clearTimeout(t3)
        }
    }, [show, reduce, onCover, onComplete])

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
                    {/* Wave that rises to cover the screen (skipped under reduced motion). */}
                    {!reduce && (
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: phase === 'exiting' ? '-100%' : '0%' }}
                            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                            className="absolute inset-0 z-10"
                            style={{ backgroundColor: accentColor }}
                        />
                    )}

                    {/* Static backdrop under reduced motion so the check reads clearly. */}
                    {reduce && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: phase === 'exiting' ? 0 : 1 }}
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 z-10"
                            style={{ backgroundColor: accentColor }}
                        />
                    )}

                    {/* Check + headline */}
                    <AnimatePresence>
                        {phase === 'showing_check' && (
                            <motion.div
                                initial={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                                animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                                exit={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                                transition={
                                    reduce
                                        ? { duration: 0.2 }
                                        : { type: 'spring', damping: 12, stiffness: 200 }
                                }
                                className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none px-6"
                            >
                                <div className="bg-white rounded-full p-4 mb-4 shadow-xl flex items-center justify-center w-24 h-24">
                                    <Check
                                        className="w-14 h-14"
                                        strokeWidth={4}
                                        style={{ color: accentColor }}
                                    />
                                </div>
                                <h2 className="text-4xl font-black tracking-tight text-white drop-shadow-md text-center">
                                    {message}
                                </h2>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </AnimatePresence>
    )
}
