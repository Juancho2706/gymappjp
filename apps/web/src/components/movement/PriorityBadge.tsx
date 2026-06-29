'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import type { PriorityBand } from '@/domain/assessment/types'

const BAND_STYLES: Record<PriorityBand, { chip: string; dot: string }> = {
    high: {
        chip: 'border-transparent bg-[var(--danger-100)] text-[color:var(--danger-600)]',
        dot: 'bg-[var(--danger-500)]',
    },
    moderate: {
        chip: 'border-transparent bg-[var(--warning-100)] text-[color:var(--warning-700)]',
        dot: 'bg-[var(--warning-500)]',
    },
    low: {
        chip: 'border-transparent bg-[var(--success-100)] text-[color:var(--success-600)]',
        dot: 'bg-[var(--success-500)]',
    },
}

/**
 * Semaforo de prioridad de trabajo correctivo (AC5: copy "prioridad",
 * jamas "riesgo de lesion").
 */
export function PriorityBadge({
    band,
    size = 'sm',
    className,
}: {
    band: PriorityBand
    size?: 'sm' | 'lg'
    className?: string
}) {
    const { t } = useTranslation()
    const styles = BAND_STYLES[band]
    return (
        <span
            className={cn(
                'inline-flex items-center gap-2 rounded-pill border font-bold',
                size === 'lg' ? 'px-4 py-2 text-base' : 'px-3 py-1 text-xs',
                styles.chip,
                className
            )}
        >
            <span className={cn('rounded-full', size === 'lg' ? 'h-3 w-3' : 'h-2 w-2', styles.dot)} aria-hidden />
            {t(`assessment.band.${band}`)}
        </span>
    )
}
