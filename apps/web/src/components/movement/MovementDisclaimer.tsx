'use client'

import { Info } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

/** Disclaimer OBLIGATORIO en reporte, vista del alumno y print (specs/movida-screening AC5). */
export function MovementDisclaimer({ className }: { className?: string }) {
    const { t } = useTranslation()
    return (
        <p
            className={cn(
                'flex items-start gap-2 rounded-control bg-surface-sunken px-3.5 py-3 text-[11px] leading-relaxed text-muted',
                className
            )}
        >
            <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
            {t('assessment.disclaimer')}
        </p>
    )
}
