'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { GlassCard } from '@/components/ui/glass-card'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

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
                        trailColor: 'var(--compliance-ring-trail)',
                        textColor: empty ? 'var(--compliance-ring-text-empty)' : 'var(--compliance-ring-text)',
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
    nutritionEngagementScore,
    checkInScore,
    nutritionHasLogs,
    nutritionEnabled = true,
}: {
    workoutScore: number
    /** Engagement de registro (días con log / 30), NO cumplimiento de comidas. */
    nutritionEngagementScore: number
    checkInScore: number
    nutritionHasLogs: boolean
    /**
     * Dominio Nutricion prendido para este alumno (master switch §4.8). Default `true` =
     * comportamiento de HOY. Cuando es `false` se oculta SOLO el anillo de Nutrición y la
     * grilla pasa a 2 columnas (Entrenos + Check-ins) — nunca un hueco vacío (NN/g pitfall).
     */
    nutritionEnabled?: boolean
}) {
    const { t } = useTranslation()
    return (
        <GlassCard className="p-4">
            <div className="mb-3 flex items-center justify-center gap-1.5">
                <p className="text-center text-xs font-semibold text-muted-foreground">Últimos 30 días</p>
                <InfoTooltip content={t('section.compliance')} />
            </div>
            <div className={`grid gap-2 ${nutritionEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <ComplianceRing value={workoutScore} label="Entrenos" color="brand" />
                {nutritionEnabled ? (
                    <ComplianceRing value={nutritionEngagementScore} label="Nutrición" color="emerald" empty={!nutritionHasLogs} />
                ) : null}
                <ComplianceRing value={checkInScore} label="Check-ins" color="violet" />
            </div>
        </GlassCard>
    )
}
