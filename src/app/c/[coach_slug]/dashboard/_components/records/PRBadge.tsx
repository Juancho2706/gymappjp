'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import confetti from 'canvas-confetti'
import { springs } from '@/lib/animation-presets'

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
        confetti({ particleCount: 60, spread: 50, origin: { x: 0.5, y: 0.75 } })
    }, [mounted, achievedAt, exerciseName])

    return (
        <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...springs.elastic, delay: index * 0.08 }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-yellow-400/40 bg-gradient-to-r from-yellow-400/20 to-amber-400/20 px-3 py-1.5 dark:border-yellow-800/50 dark:from-yellow-400/10 dark:to-amber-400/10"
        >
            <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-bold text-foreground">{exerciseName}</span>
            <span className="text-[10px] font-black tabular-nums text-amber-700 dark:text-amber-300">{weightKg} kg</span>
        </motion.div>
    )
}
