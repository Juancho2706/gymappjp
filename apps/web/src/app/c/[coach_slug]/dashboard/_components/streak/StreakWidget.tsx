'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Flame } from 'lucide-react'


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fireConfetti = (opts: object) => (import('canvas-confetti') as Promise<any>).then(m => (m.default ?? m)(opts))

interface StreakWidgetProps {
    streak: number
}

export function StreakWidget({ streak }: StreakWidgetProps) {
    const [mounted, setMounted] = useState(false)
    const reduce = useReducedMotion()

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted || reduce || streak < 30) return
        const key = `streak-confetti-${streak}`
        if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            fireConfetti({ particleCount: 60, spread: 50, origin: { x: 0.85, y: 0.12 } })
        }
    }, [mounted, reduce, streak])

    if (streak === 0) {
        return <p className="text-[10px] text-muted">Empieza tu racha</p>
    }

    const pulse = streak >= 3
    const big = streak >= 7

    return (
        <motion.div
            className={`flex items-center gap-1.5 rounded-pill border border-ember-200 bg-ember-100 px-2.5 py-1 ${big ? 'shadow-[0_0_12px_rgba(255,106,61,0.35)]' : ''}`}
            animate={pulse && !reduce ? { scale: [1, 1.06, 1] } : undefined}
            transition={pulse && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
            <Flame className={`${big ? 'h-5 w-5' : 'h-4 w-4'} text-ember-500`} />
            <span className="text-sm font-black tabular-nums text-ember-700">{streak}</span>
            <span className="text-[10px] font-semibold text-ember-700/70">días</span>
        </motion.div>
    )
}
