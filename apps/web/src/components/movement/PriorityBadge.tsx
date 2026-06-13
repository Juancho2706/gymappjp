'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import type { PriorityBand } from '@/domain/assessment/types'

const BAND_STYLES: Record<PriorityBand, { chip: string; dot: string }> = {
    high: {
        chip: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
        dot: 'bg-red-500',
    },
    moderate: {
        chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    low: {
        chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
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
                'inline-flex items-center gap-2 rounded-full border font-semibold',
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
