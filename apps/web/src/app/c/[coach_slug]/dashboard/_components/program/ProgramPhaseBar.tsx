'use client'

import { motion } from 'framer-motion'
import { springs } from '@/lib/animation-presets'

export interface PhaseSeg {
    name: string
    weeks: number
    color?: string
}

export function ProgramPhaseBar({
    phases,
    currentWeek,
    totalWeeks,
}: {
    phases: PhaseSeg[] | null
    currentWeek: number
    totalWeeks: number
}) {
    const pct = totalWeeks > 0 ? Math.min(100, (currentWeek / totalWeeks) * 100) : 0

    if (!phases || !Array.isArray(phases) || phases.length === 0) {
        return (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${pct}%` }}
                    transition={springs.lazy}
                />
            </div>
        )
    }

    return (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-0 flex">
                {phases.map((p, i) => (
                    <div
                        key={`${p.name}-${i}`}
                        className="h-full border-r border-background/50 last:border-0"
                        style={{
                            width: `${(p.weeks / totalWeeks) * 100}%`,
                            backgroundColor: p.color || 'color-mix(in srgb, var(--theme-primary) 40%, transparent)',
                        }}
                    />
                ))}
            </div>
            <motion.div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md"
                style={{ backgroundColor: 'var(--theme-primary)', left: `${pct}%` }}
                initial={{ left: '0%' }}
                animate={{ left: `${pct}%` }}
                transition={{ ...springs.smooth, delay: 0.2 }}
            />
        </div>
    )
}
