'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

export type Trend = 'up' | 'down' | 'stable'

export function TrendArrow({ trend, deltaKg }: { trend: Trend; deltaKg: number }) {
    const reduced = useReducedMotion()
    const bounce =
        trend === 'up'
            ? { y: [0, -4, 0] }
            : trend === 'down'
              ? { y: [0, 4, 0] }
              : { y: 0 }

    const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
    const color =
        trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-emerald-500' : 'text-muted-foreground'

    return (
        <div className={`flex items-center gap-1 ${color}`}>
            <motion.span
                animate={reduced ? undefined : bounce}
                transition={reduced ? undefined : { duration: 1.5, repeat: Infinity, delay: 0.5 }}
            >
                <Icon className="h-4 w-4" />
            </motion.span>
            {trend !== 'stable' ? (
                <span className="text-xs tabular-nums">
                    {deltaKg > 0 ? '+' : ''}
                    {deltaKg.toFixed(1)} kg
                </span>
            ) : null}
        </div>
    )
}
