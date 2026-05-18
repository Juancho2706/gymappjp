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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { libraryInitialsFromName } from './libraryInitials'

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

function accentBarClass(program: ProgramListModel) {
    const isTemplate = !program.client_id
    if (isTemplate) return 'bg-primary'
    if (program.is_active) return 'bg-emerald-500 dark:bg-emerald-400'
    return 'bg-muted-foreground/35'
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

    const clientName = program.client?.full_name
    const initials = libraryInitialsFromName(clientName)

    return (
        <div
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick}
            onKeyDown={
                onRowClick
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onRowClick()
                          }
                      }
                    : undefined
            }
            className={cn(
                'touch-manipulation flex w-full min-w-0 max-w-full items-stretch gap-0 rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm transition-[box-shadow,border-color,background-color]',
                onRowClick &&
                    'cursor-pointer hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSelected &&
                    'border-primary/35 bg-primary/5 shadow-md ring-2 ring-primary/25 ring-offset-2 ring-offset-background dark:bg-primary/10 dark:ring-offset-background'
            )}
        >
            <div
                className={cn('w-1 shrink-0 self-stretch min-h-[3rem]', accentBarClass(program))}
                aria-hidden
            />
            <div
                className={cn(
                    'flex min-w-0 flex-1 gap-2',
                    compact
                        ? 'min-h-[52px] items-center py-2 pl-2.5 pr-1 sm:pl-3'
                        : 'min-h-[64px] flex-col items-stretch justify-center gap-1.5 py-3 pl-3 pr-2 text-left'
                )}
            >
                <div className="min-w-0 w-full flex-1 text-left">
                    <div className="flex flex-wrap items-center justify-start gap-2">
                        <span className={cn('truncate font-semibold text-foreground', compact && 'text-sm')}>
                            {program.name}
                        </span>
                        {stats.templateLabel === 'Plantilla' ? (
                            <Badge
                                variant="outline"
                                className="shrink-0 border-primary/25 bg-primary/5 text-[10px] font-semibold text-primary"
                            >
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
                        {compact && !isTemplate && clientName && (
                            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <Avatar size="sm" className="size-6">
                                    <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
                                </Avatar>
                                <span className="truncate">{clientName}</span>
                            </span>
                        )}
                    </div>
                    {!compact && (
                        <>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
                            {!isTemplate && clientName && (
                                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                                    <Avatar size="sm" className="size-8 shrink-0">
                                        <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="truncate text-sm font-medium text-foreground/90">{clientName}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center self-center pr-1 sm:pr-2">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            'inline-flex shrink-0 items-center justify-center rounded-full border-0 bg-transparent px-0 font-medium normal-case tracking-normal text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
        </div>
    )
}
