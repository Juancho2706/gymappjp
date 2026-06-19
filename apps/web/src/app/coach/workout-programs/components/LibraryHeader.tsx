'use client'

import Link from 'next/link'
import { Dumbbell, Hash, Layers, ListChecks, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
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
        <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        Biblioteca de programas
                    </h1>
                    <InfoTooltip content={t('section.coachPrograms')} />
                </div>
                <p className="text-sm text-muted-foreground">
                    Crea plantillas, asígnalas y gestiona planes en curso.
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary',
                            'dark:border-primary/25 dark:bg-primary/15'
                        )}
                    >
                        <Layers className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        {templateCount} plantillas
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                        <ListChecks className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        {activeAssignedCount} activos
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        <Hash className="size-3.5 shrink-0 opacity-70" aria-hidden />
                        {totalCount} total
                    </span>
                </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {/* Movida 2: "Ejercicios" deja de ser menu top-level — entrada contextual aqui.
                    La ruta /coach/exercises sigue viva (deep links + app alumno). */}
                <Link
                    href="/coach/exercises"
                    className={cn(
                        buttonVariants({ variant: 'outline' }),
                        'h-11 w-full gap-2 rounded-xl px-4 sm:h-10 sm:w-auto sm:rounded-lg',
                        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/40 hover:bg-emerald-500/20',
                        'dark:text-emerald-200'
                    )}
                >
                    <Dumbbell className="size-4" />
                    Lista de ejercicios
                </Link>
                <Button
                    type="button"
                    onClick={onNewTemplate}
                    className="h-11 w-full gap-2 rounded-xl px-4 shadow-sm sm:h-10 sm:w-auto sm:rounded-lg"
                >
                    <Plus className="size-4" />
                    Nueva plantilla
                </Button>
            </div>
        </div>
    )
}
