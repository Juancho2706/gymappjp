'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export interface LibraryHeaderProps {
    templateCount: number
    activeAssignedCount: number
    totalCount: number
    onNewTemplate: () => void
    className?: string
}

export function LibraryHeader({
    templateCount,
    activeAssignedCount,
    totalCount,
    onNewTemplate,
    className,
}: LibraryHeaderProps) {
    const { t } = useTranslation()
    return (
        <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        Biblioteca de programas
                    </h1>
                    <InfoTooltip content={t('section.coachPrograms')} />
                </div>
                <p className="text-sm text-muted-foreground">
                    Crea plantillas, asígnalas y gestiona planes en curso.
                </p>
                <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 font-medium text-foreground">
                        {templateCount} plantillas
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 font-medium text-foreground">
                        {activeAssignedCount} activos
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 font-medium text-foreground">
                        {totalCount} total
                    </span>
                </p>
            </div>
            <Button
                type="button"
                onClick={onNewTemplate}
                className="h-11 shrink-0 gap-2 rounded-lg px-4 sm:h-10"
            >
                <Plus className="size-4" />
                Nueva plantilla
            </Button>
        </div>
    )
}
