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
                'flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground',
                className
            )}
        >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('assessment.disclaimer')}
        </p>
    )
}
