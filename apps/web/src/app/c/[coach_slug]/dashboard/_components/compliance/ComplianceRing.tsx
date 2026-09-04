'use client'

import { Card } from '@/components/ui/card'
import { CountUpText } from '@/components/ui/count-up'
import { ProgressRing } from '@/components/ui/progress-ring'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type RingColor = 'sport' | 'ember' | 'success'

interface ComplianceRingProps {
    /**
     * Porcentaje 0..100, o `null` cuando la métrica NO TIENE denominador: en un programa `cycle` no
     * hay meta semanal de entrenos (spec `ciclo-real-y-por-lado`, R12), así que se pinta «—» en vez
     * de un porcentaje inventado. El rótulo de ese caso llega en la pasada visual (W2.13).
     */
    value: number | null
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
    // Sin métrica (`null`) se pinta igual que "sin datos": anillo gris y «—», nunca un 0 % que
    // castigue al alumno por entrenar el día que quiso.
    const noValue = empty || value == null
    // El count-up vive en `CountUpText` (MotionValue → DOM, cero estado React).
    const ringValue = noValue ? 0 : value
    const pathColor = noValue ? emptyStroke : stroke[color]

    return (
        <div className="flex flex-col items-center gap-2">
            <ProgressRing
                value={ringValue}
                size={76}
                stroke={7}
                color={pathColor}
                label={
                    noValue ? (
                        <span className="font-display text-lg font-black text-subtle">—</span>
                    ) : (
                        <span className="font-display text-[19px] font-black tabular-nums tracking-[-0.03em] text-strong">
                            <CountUpText value={value} />
                            <span className="text-[11px]">%</span>
                        </span>
                    )
                }
            />
            <div className="text-center">
                <div className="text-xs font-bold text-strong">{label}</div>
                {empty ? (
                    <div className="text-[10px] text-subtle">Sin datos</div>
                ) : value == null ? (
                    // R12: programa `cycle` ⇒ no hay meta semanal de entrenos; rótulo canónico del SPEC.
                    <div className="text-[10px] text-subtle">Sin meta semanal</div>
                ) : null}
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
    /** `null` en programas `cycle`: sin meta semanal el anillo pinta «—» (R12). */
    workoutScore: number | null
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
