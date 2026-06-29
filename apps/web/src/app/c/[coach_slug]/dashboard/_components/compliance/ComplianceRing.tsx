'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type RingColor = 'sport' | 'ember' | 'success'

interface ComplianceRingProps {
    value: number
    label: string
    color: RingColor
    /** Sin datos en ventana (p. ej. nutrición 30d): anillo gris y leyenda. */
    empty?: boolean
}

const stroke: Record<RingColor, string> = {
    sport: 'var(--sport-500)',
    ember: 'var(--ember-500)',
    success: 'var(--success-500)',
}

const emptyStroke = 'var(--ink-300)'

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
    const ringValue = empty ? 0 : value
    const pathColor = empty ? emptyStroke : stroke[color]

    return (
        <div className="flex flex-col items-center gap-2">
            <ProgressRing
                value={ringValue}
                size={76}
                stroke={7}
                color={pathColor}
                label={
                    empty ? (
                        <span className="font-display text-lg font-black text-subtle">—</span>
                    ) : (
                        <span className="font-display text-[19px] font-black tabular-nums tracking-[-0.03em] text-strong">
                            {displayPct}
                            <span className="text-[11px]">%</span>
                        </span>
                    )
                }
            />
            <div className="text-center">
                <div className="text-xs font-bold text-strong">{label}</div>
                {empty ? <div className="text-[10px] text-subtle">Sin datos</div> : null}
            </div>
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
        <Card padding="md">
            <div className="-mb-1 flex items-center justify-center gap-1.5">
                <p className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">Últimos 30 días</p>
                <InfoTooltip content={t('section.compliance')} />
            </div>
            <div className={`grid gap-2 ${nutritionEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <ComplianceRing value={workoutScore} label="Entrenos" color="sport" />
                {nutritionEnabled ? (
                    <ComplianceRing value={nutritionEngagementScore} label="Nutrición" color="ember" empty={!nutritionHasLogs} />
                ) : null}
                <ComplianceRing value={checkInScore} label="Check-ins" color="success" />
            </div>
        </Card>
    )
}
