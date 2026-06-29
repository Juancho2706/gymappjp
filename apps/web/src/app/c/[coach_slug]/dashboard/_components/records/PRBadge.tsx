'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'

import { springs } from '@/lib/animation-presets'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fireConfetti = (opts: object) => (import('canvas-confetti') as Promise<any>).then(m => (m.default ?? m)(opts))

interface PRBadgeProps {
    exerciseName: string
    weightKg: number
    achievedAt: string
    index: number
}

export function PRBadge({ exerciseName, weightKg, achievedAt, index }: PRBadgeProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted) return
        const t = new Date(achievedAt).getTime()
        if (Date.now() - t > 24 * 60 * 60 * 1000) return
        const key = `pr-confetti-${exerciseName}-${achievedAt.slice(0, 10)}`
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
        fireConfetti({ particleCount: 60, spread: 50, origin: { x: 0.5, y: 0.75 } })
    }, [mounted, achievedAt, exerciseName])

    return (
        <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...springs.elastic, delay: index * 0.08 }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-subtle bg-surface-card px-3 py-1.5 shadow-sm"
        >
            <Trophy className="h-3.5 w-3.5 text-[var(--warning-500)]" />
            <span className="text-xs font-bold text-strong">{exerciseName}</span>
            <span className="font-display text-[11px] font-black tabular-nums text-sport-500">{weightKg} kg</span>
        </motion.div>
    )
}
