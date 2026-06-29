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
    const pill =
        trend === 'up'
            ? 'bg-[var(--danger-100)] text-[var(--danger-700,var(--danger-600))]'
            : trend === 'down'
              ? 'bg-[var(--success-100)] text-[var(--success-700)]'
              : 'text-muted'

    return (
        <div className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-[13px] font-bold ${pill}`}>
            <motion.span
                animate={reduced ? undefined : bounce}
                transition={reduced ? undefined : { duration: 1.5, repeat: Infinity, delay: 0.5 }}
            >
                <Icon className="h-3.5 w-3.5" />
            </motion.span>
            {trend !== 'stable' ? (
                <span className="tabular-nums">
                    {deltaKg > 0 ? '+' : ''}
                    {deltaKg.toFixed(1)} kg
                </span>
            ) : null}
        </div>
    )
}
