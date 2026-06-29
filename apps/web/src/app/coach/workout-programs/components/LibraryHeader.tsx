'use client'

import Link from 'next/link'
import { Dumbbell, Hash, Layers, LayoutList, ListChecks, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-strong sm:text-3xl">
                        Biblioteca de programas
                    </h1>
                    <InfoTooltip content={t('section.coachPrograms')} />
                </div>
                <p className="text-sm text-muted">
                    Crea plantillas, asígnalas y gestiona planes en curso.
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                    <Badge tone="sport" variant="soft" icon={<Layers aria-hidden />}>
                        {templateCount} plantillas
                    </Badge>
                    <Badge tone="success" variant="soft" icon={<ListChecks aria-hidden />}>
                        {activeAssignedCount} activos
                    </Badge>
                    <Badge tone="neutral" variant="soft" icon={<Hash aria-hidden />}>
                        {totalCount} total
                    </Badge>
                </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {/* Movida 2: "Ejercicios" deja de ser menu top-level — entrada contextual aqui.
                    La ruta /coach/exercises sigue viva (deep links + app alumno). */}
                <Link
                    href="/coach/exercises"
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'h-11 w-full gap-2 rounded-control px-4 sm:h-10 sm:w-auto'
                    )}
                >
                    <Dumbbell className="size-4" />
                    Lista de ejercicios
                </Link>
                {/* Reestructura settings F6: "Áreas del builder" sale del hub Opciones y vive acá,
                    junto al builder donde se usan. La ruta /coach/settings/areas sigue viva (deep links). */}
                <Link
                    href="/coach/settings/areas"
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'h-11 w-full gap-2 rounded-control px-4 sm:h-10 sm:w-auto'
                    )}
                >
                    <LayoutList className="size-4" />
                    Áreas del builder
                </Link>
                <Button
                    type="button"
                    variant="sport"
                    onClick={onNewTemplate}
                    className="h-11 w-full gap-2 rounded-control px-4 sm:h-10 sm:w-auto"
                >
                    <Plus className="size-4" />
                    Nueva plantilla
                </Button>
            </div>
        </div>
    )
}
