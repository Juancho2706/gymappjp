'use client'

import { motion } from 'framer-motion'
import { springs } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'

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
            <div className="h-2 overflow-hidden rounded-pill bg-[var(--track)]">
                <motion.div
                    className="h-full rounded-pill"
                    style={{ backgroundColor: 'var(--sport-500)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${pct}%` }}
                    transition={springs.lazy}
                />
            </div>
        )
    }

    // Segmentos por estado (kit alumno-dashboard.jsx:397-411): actual sport-500, pasadas sport-200,
    // futuras sunken; debajo la fila de nombres justificados (actual en negrita sport-600).
    const segs = phases.map((p, i) => {
        const before = phases.slice(0, i).reduce((a, ph) => a + ph.weeks, 0)
        const isCurrent = currentWeek > before && currentWeek <= before + p.weeks
        const isPast = before + p.weeks < currentWeek
        return { ...p, isCurrent, isPast }
    })

    return (
        <div>
            <div className="flex gap-[3px]">
                {segs.map((p, i) => (
                    <div
                        key={`${p.name}-${i}`}
                        title={p.name}
                        className={cn(
                            'h-2 rounded-pill',
                            p.isCurrent ? 'bg-sport-500' : p.isPast ? 'bg-sport-200' : 'bg-surface-sunken'
                        )}
                        style={{ flexGrow: p.weeks, flexBasis: 0 }}
                    />
                ))}
            </div>
            <div className="mt-1.5 flex justify-between">
                {segs.map((p, i) => (
                    <span
                        key={`${p.name}-label-${i}`}
                        className={cn('text-[10px]', p.isCurrent ? 'font-extrabold text-sport-600' : 'font-semibold text-subtle')}
                    >
                        {p.name}
                    </span>
                ))}
            </div>
        </div>
    )
}
