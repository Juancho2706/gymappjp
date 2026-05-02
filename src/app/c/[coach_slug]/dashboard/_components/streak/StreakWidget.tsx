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
        return <p className="text-[10px] text-muted-foreground">Empieza tu racha</p>
    }

    const pulse = streak >= 3
    const big = streak >= 7

    return (
        <motion.div
            className={`flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 dark:border-orange-400/20 dark:bg-orange-400/10 ${big ? 'shadow-[0_0_12px_rgba(251,146,60,0.35)]' : ''}`}
            animate={pulse && !reduce ? { scale: [1, 1.06, 1] } : undefined}
            transition={pulse && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
            <Flame className={`${big ? 'h-5 w-5' : 'h-4 w-4'} text-orange-500 dark:text-orange-400`} />
            <span className="text-sm font-bold tabular-nums text-orange-600 dark:text-orange-300">{streak}</span>
            <span className="text-[10px] text-orange-500/70 dark:text-orange-400/60">días</span>
        </motion.div>
    )
}
