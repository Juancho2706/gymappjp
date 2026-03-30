'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
    show: boolean
    onComplete: () => void
}

export function SuccessWaveOverlay({ show, onComplete }: Props) {
    const [phase, setPhase] = useState<'hidden' | 'entering' | 'showing_check' | 'exiting'>('hidden')

    useEffect(() => {
        if (show) {
            setPhase('entering')
            
            // Secuencia de animación
            const t1 = setTimeout(() => setPhase('showing_check'), 600) // Wave sube
            const t2 = setTimeout(() => setPhase('exiting'), 2000) // Muestra el check por 1.4s
            const t3 = setTimeout(() => {
                setPhase('hidden')
                onComplete()
            }, 2600) // Wave se va hacia arriba

            return () => {
                clearTimeout(t1)
                clearTimeout(t2)
                clearTimeout(t3)
            }
        }
    }, [show, onComplete])

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
                    {/* Ola verde que sube */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ 
                            y: phase === 'exiting' ? '-100%' : '0%',
                        }}
                        transition={{ 
                            duration: 0.6, 
                            ease: [0.32, 0.72, 0, 1] // Custom ease-out
                        }}
                        className="absolute inset-0 bg-[#22c55e] z-10"
                    />

                    {/* Checkmark and Text */}
                    <AnimatePresence>
                        {phase === 'showing_check' && (
                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                                className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
                            >
                                <div className="bg-white rounded-full p-4 mb-4 shadow-xl flex items-center justify-center w-24 h-24">
                                    <Check className="w-14 h-14 text-[#22c55e]" strokeWidth={4} />
                                </div>
                                <h2 className="text-4xl font-black tracking-tight text-white drop-shadow-md text-center">
                                    Plan guardado
                                </h2>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </AnimatePresence>
    )
}
