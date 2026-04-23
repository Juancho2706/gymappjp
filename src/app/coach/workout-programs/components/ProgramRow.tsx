'use client'

import { useRouter } from 'next/navigation'
import {
    Copy,
    Eye,
    GitMerge,
    Loader2,
    MoreHorizontal,
    Pencil,
    Trash2,
    Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ProgramListModel } from '../libraryStats'
import { formatShortActivityDate, getProgramStats } from '../libraryStats'

export interface ProgramRowProps {
    program: ProgramListModel
    compact: boolean
    isPending: boolean
    isActionPending: boolean
    isSelected?: boolean
    onRowClick?: () => void
    onAssign: () => void
    onPreview: () => void
    onDuplicate: () => void
    onSync?: () => void
    onDelete: () => void
}

export function ProgramRow({
    program,
    compact,
    isPending,
    isActionPending,
    isSelected,
    onRowClick,
    onAssign,
    onPreview,
    onDuplicate,
    onSync,
    onDelete,
}: ProgramRowProps) {
    const router = useRouter()
    const stats = getProgramStats(program)
    const isTemplate = !program.client_id
    const editHref = isTemplate
        ? `/coach/workout-programs/builder?programId=${program.id}`
        : `/coach/builder/${program.client_id}?programId=${program.id}`

    const meta = [
        `${stats.daysWithWork} días`,
        `${stats.blockCount} bloques`,
        stats.cycleLabel,
        stats.weeksLabel,
        `Act. ${formatShortActivityDate(stats.lastActivityIso)}`,
    ].filter(Boolean).join(' · ')

    return (
        <div
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick() } } : undefined}
            className={cn(
                'flex w-full min-w-0 max-w-full items-center gap-2 border-b border-border/60 bg-background/80 transition-colors last:border-b-0 hover:bg-muted/20',
                compact ? 'min-h-[52px] px-2 py-1.5 sm:px-3' : 'min-h-[60px] px-3 py-2.5 sm:px-4',
                onRowClick && 'cursor-pointer',
                isSelected && 'bg-primary/5 hover:bg-primary/8 ring-2 ring-inset ring-primary/35'
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('truncate font-medium text-foreground', compact && 'text-sm')}>{program.name}</span>
                    {stats.templateLabel === 'Plantilla' ? (
                        <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/5 text-[10px] font-semibold text-primary">
                            Plantilla
                        </Badge>
                    ) : (
                        <Badge
                            variant="outline"
                            className={cn(
                                'shrink-0 text-[10px] font-semibold',
                                program.is_active
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                                    : 'border-border text-muted-foreground'
                            )}
                        >
                            {stats.templateLabel}
                        </Badge>
                    )}
                    {!compact && stats.hasPhases && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Fases
                        </Badge>
                    )}
                    {!compact && program.ab_mode && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                            A/B
                        </Badge>
                    )}
                    {!compact && program.duration_type === 'async' && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Asíncrono
                        </Badge>
                    )}
                    {compact && !isTemplate && program.client?.full_name && (
                        <span className="truncate text-xs text-muted-foreground">{program.client.full_name}</span>
                    )}
                </div>
                {!compact && (
                    <>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
                        {!isTemplate && program.client?.full_name && (
                            <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">{program.client.full_name}</p>
                        )}
                    </>
                )}
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        'inline-flex shrink-0 items-center justify-center rounded-lg border-0 bg-transparent px-0 font-medium normal-case tracking-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'min-h-11 min-w-11 sm:min-h-10 sm:min-w-10'
                    )}
                    aria-label="Acciones del programa"
                >
                    {isPending && isActionPending ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <MoreHorizontal className="size-5 sm:size-4" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                    {!isTemplate ? null : (
                        <DropdownMenuItem onClick={onAssign}>
                            <Users className="mr-2 size-4" />
                            Asignar
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={onPreview}>
                        <Eye className="mr-2 size-4" />
                        Vista previa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onDuplicate} disabled={isPending && isActionPending}>
                        <Copy className="mr-2 size-4" />
                        Duplicar
                    </DropdownMenuItem>
                    {program.source_template_id && onSync ? (
                        <DropdownMenuItem onClick={onSync} disabled={isPending && isActionPending}>
                            <GitMerge className="mr-2 size-4" />
                            Sincronizar
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => router.push(editHref)}>
                        <Pencil className="mr-2 size-4" />
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={isPending && isActionPending}>
                        <Trash2 className="mr-2 size-4" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
