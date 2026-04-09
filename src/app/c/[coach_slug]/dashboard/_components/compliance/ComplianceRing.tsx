'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { useTheme } from 'next-themes'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { GlassCard } from '@/components/ui/glass-card'

interface ComplianceRingProps {
    value: number
    label: string
    color: 'brand' | 'emerald' | 'violet'
    /** Sin datos en ventana (p. ej. nutrición 30d): anillo gris y leyenda. */
    empty?: boolean
}

const stroke: Record<ComplianceRingProps['color'], string> = {
    brand: 'var(--theme-primary)',
    emerald: '#10b981',
    violet: '#8b5cf6',
}

const emptyStroke = '#9ca3af'

export function ComplianceRing({ value, label, color, empty }: ComplianceRingProps) {
    const { resolvedTheme } = useTheme()
    const reduce = useReducedMotion()
    const [animated, setAnimated] = useState(reduce ? value : 0)
    const mv = useMotionValue(0)
    const spring = useSpring(mv, { stiffness: 60, damping: 20 })

    useEffect(() => {
        if (empty) {
            mv.set(0)
            setAnimated(0)
            return
        }
        mv.set(value)
    }, [value, mv, empty])

    useMotionValueEvent(spring, 'change', (v) => {
        setAnimated(Math.round(v))
    })

    const trail = resolvedTheme === 'dark' ? '#374151' : '#e5e7eb'
    const displayPct = empty ? 0 : reduce ? value : animated
    const pathColor = empty ? emptyStroke : stroke[color]
    const centerText = empty ? '—' : `${displayPct}%`
    const textSize = empty ? '22px' : '28px'

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="h-20 w-20 sm:h-24 sm:w-24">
                <CircularProgressbar
                    value={displayPct}
                    text={centerText}
                    styles={buildStyles({
                        pathColor,
                        trailColor: trail,
                        textColor: empty ? (resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280') : resolvedTheme === 'dark' ? '#f9fafb' : '#111827',
                        textSize,
                    })}
                />
            </div>
            <span className="text-center text-[10px] font-medium text-muted-foreground sm:text-xs">{label}</span>
            {empty ? <span className="text-center text-[9px] text-muted-foreground/80">Sin datos</span> : null}
        </div>
    )
}

export function ComplianceRingCluster({
    workoutScore,
    nutritionScore,
    checkInScore,
    nutritionHasLogs,
}: {
    workoutScore: number
    nutritionScore: number
    checkInScore: number
    nutritionHasLogs: boolean
}) {
    return (
        <GlassCard className="p-4">
            <p className="mb-3 text-center text-xs font-semibold text-muted-foreground">Últimos 30 días</p>
            <div className="grid grid-cols-3 gap-2">
                <ComplianceRing value={workoutScore} label="Entrenos" color="brand" />
                <ComplianceRing value={nutritionScore} label="Nutrición" color="emerald" empty={!nutritionHasLogs} />
                <ComplianceRing value={checkInScore} label="Check-ins" color="violet" />
            </div>
        </GlassCard>
    )
}
