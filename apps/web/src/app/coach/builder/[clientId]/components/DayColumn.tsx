'use client'

import React, { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Search, Copy, Moon, Sun, Link2, Unlink, Dumbbell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getMuscleColor } from '../muscle-colors'
import { cn, filterExercises } from '@/lib/utils'
import { ExerciseBlock } from './ExerciseBlock'
import { DAYS_OF_WEEK } from '../hooks/usePlanBuilder'
import { buildAreaVMs, type BuilderAreaVM } from '../area-ui'
import { effectiveAreaKey } from '@/lib/workout-areas'
import { groupContiguousSupersetRuns } from '@/lib/workout-block-grouping'
import type { DayState } from '../types'
import type { WorkoutArea } from '@/domain/workout/types'
import type { BuilderBlock } from '../types'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

function AreaDropZone({
    dayId,
    area,
    showDropHint = true,
    narrow = false,
    count,
}: {
    dayId: number
    area: BuilderAreaVM
    showDropHint?: boolean
    /** Mobile: header sólido dot + label + conteo (el chrome punteado queda para drop-targets desktop) */
    narrow?: boolean
    count?: number
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `area-${dayId}-${area.id}`,
        data: { type: 'area', dayId, areaId: area.id },
    })
    if (narrow) {
        return (
            <div
                ref={setNodeRef}
                className={cn(
                    'mb-2 mt-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground transition-colors select-none',
                    isOver && 'text-primary',
                )}
            >
                <span className={cn('h-[9px] w-[9px] shrink-0 rounded-[3px] border', area.badgeClass)} />
                <span>{area.name}</span>
                {count != null && <span className="font-bold text-subtle">· {count}</span>}
            </div>
        )
    }
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-control border border-dashed mb-1 transition-colors select-none',
                area.zoneClass,
                isOver && 'border-primary bg-primary/10 text-primary ring-1 ring-primary/25',
            )}
        >
            {area.name}
            {showDropHint && (
                <span className="font-normal normal-case opacity-60 ml-1">· soltar</span>
            )}
        </div>
    )
}

interface DayColumnProps {
    day: DayState
    exercises: Exercise[]
    allDays?: DayState[]
    isCycleMode?: boolean
    isDragPending?: boolean
    /** Areas disponibles (system + custom) — vacio ⇒ fallback a los 3 clasicos */
    areas?: WorkoutArea[]
    onAddExercise: (dayId: number, exercise: Exercise) => void
    onEditBlock: (block: BuilderBlock) => void
    onRemoveBlock: (dayId: number, uid: string) => void
    onUpdateBlock: (block: BuilderBlock) => void
    onUpdateTitle: (dayId: number, title: string) => void
    onCopyDay: (sourceId: number, targets: number[]) => void
    onToggleRest: (dayId: number) => void
    onToggleSuperset: (dayId: number, uid: string, intent?: 'link' | 'unlink') => void
    onSetBlockArea?: (dayId: number, uid: string, areaId: string) => void
    onToggleBlockOverride?: (uid: string) => void
    /** Reordenar por tap (rail de chevrons mobile) — reusa MOVE_BLOCK del reducer */
    onMoveBlock?: (dayId: number, uid: string, dir: -1 | 1) => void
    templateLinked?: boolean
    /** Viewport estrecho (mismo criterio que md en Tailwind): microcopia sin arrastrar/soltar a secciones */
    narrowLayout?: boolean
    /** Modo simple móvil: oculta meta del día y reduce padding del header */
    compact?: boolean
}

function DayColumnInner({
    day,
    exercises,
    allDays,
    isCycleMode = false,
    isDragPending,
    areas,
    onAddExercise,
    onEditBlock,
    onRemoveBlock,
    onUpdateBlock,
    onUpdateTitle,
    onCopyDay,
    onToggleRest,
    onToggleSuperset,
    onSetBlockArea,
    onToggleBlockOverride,
    onMoveBlock,
    templateLinked,
    narrowLayout = false,
    compact = false,
}: DayColumnProps) {
    const { id: dayId, title, blocks, name, is_rest } = day
    const dayLabel = isCycleMode ? `Día ${dayId}` : name

    const [search, setSearch] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [selectedDaysToCopy, setSelectedDaysToCopy] = useState<number[]>([])
    const [copySheetOpen, setCopySheetOpen] = useState(false)

    // Areas: VMs ordenados por sort_order + clave efectiva por bloque (fallback legacy)
    const areaVMs = useMemo(() => buildAreaVMs(areas ?? []), [areas])
    const areaById = useMemo(() => new Map(areaVMs.map(a => [a.id, a])), [areaVMs])
    const knownAreaIds = useMemo(() => new Set(areaVMs.map(a => a.id)), [areaVMs])
    const areaKeyOf = (b: BuilderBlock) => effectiveAreaKey(b, knownAreaIds)

    // uids de bloques que pertenecen a una superserie VÁLIDA (≥2 contiguas en la misma
    // área). Usamos el helper canónico (con su singleton guard) para no pintar el badge
    // SS·A sobre un bloque suelto (dato legacy/importado o estado transitorio). El
    // order_index sintético = posición en el array (lo que persiste el save) y filtramos
    // por área porque una superserie nunca cruza áreas — espeja la ejecución del alumno.
    const validSupersetUids = useMemo(() => {
        const byArea = new Map<string, { id: string; order_index: number; superset_group: string | null | undefined }[]>()
        blocks.forEach((b, i) => {
            const key = effectiveAreaKey(b, knownAreaIds)
            const row = { id: b.uid, order_index: i, superset_group: b.superset_group }
            const arr = byArea.get(key)
            if (arr) arr.push(row)
            else byArea.set(key, [row])
        })
        const valid = new Set<string>()
        for (const rows of byArea.values()) {
            for (const run of groupContiguousSupersetRuns(rows)) {
                if (run.type === 'superset') {
                    for (const r of run.blocks) valid.add(r.id)
                }
            }
        }
        return valid
    }, [blocks, knownAreaIds])

    const totalSets = useMemo(() => blocks.reduce((sum, b) => sum + (b.sets || 0), 0), [blocks])
    const uniqueMuscles = useMemo(
        () => Array.from(new Set(blocks.map(b => b.muscle_group).filter(Boolean))),
        [blocks]
    )

    const filtered = useMemo(() => {
        if (!search) return []
        return filterExercises(exercises, search, 'Todos').slice(0, 5)
    }, [exercises, search])

    const { setNodeRef } = useDroppable({
        id: `day-${dayId}`,
        data: {
            type: 'day',
            dayId
        }
    })

    return (
        <div className={cn(
            'flex min-w-0 max-w-full flex-col h-full transition-colors duration-300',
            narrowLayout
                ? 'w-full'
                : cn(
                    'backdrop-blur-xl border border-border rounded-card overflow-hidden shadow-sm',
                    // Ancho fijo en desktop para que nombres largos hagan wrap y no estiren el tablero
                    'w-full min-w-[200px] max-w-full md:w-[300px] md:max-w-[300px] md:flex-shrink-0 lg:w-[320px] lg:max-w-[320px]',
                    is_rest
                        ? 'bg-muted/30 dark:bg-muted/20'
                        : 'bg-card dark:bg-card/80'
                )
        )}>
            {!compact && (
            <div className={cn(
                narrowLayout
                    ? 'px-4 pt-2 pb-0'
                    : cn('border-b border-border p-4', is_rest ? 'bg-muted/40' : 'bg-muted/30')
            )}>
                {narrowLayout ? (
                    <>
                        <div className="flex items-center gap-2.5">
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{dayLabel}</div>
                                {!is_rest ? (
                                    <input
                                        value={title}
                                        onChange={(e) => onUpdateTitle(dayId, e.target.value)}
                                        placeholder="Título del día (ej. Empuje)"
                                        maxLength={100}
                                        autoComplete="off"
                                        className="w-full border-none bg-transparent font-display text-[22px] font-black tracking-[-0.02em] text-strong outline-none placeholder:text-muted-foreground/50"
                                    />
                                ) : (
                                    <div className="font-display text-[22px] font-black tracking-[-0.02em] text-strong">Descanso</div>
                                )}
                            </div>
                            <button
                                onClick={() => onToggleRest(dayId)}
                                title={is_rest ? 'Marcar como día activo' : 'Marcar como descanso'}
                                className={cn(
                                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition-colors',
                                    is_rest ? 'text-primary-foreground' : 'bg-surface-sunken text-muted hover:text-strong'
                                )}
                                style={is_rest ? { backgroundColor: 'var(--theme-primary, #2680FF)' } : undefined}
                            >
                                {is_rest ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                            </button>
                            {!is_rest && blocks.length > 0 && (
                                <button
                                    onClick={() => setCopySheetOpen(true)}
                                    title="Copiar día"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-muted transition-colors hover:text-strong"
                                >
                                    <Copy className="h-[18px] w-[18px]" />
                                </button>
                            )}
                        </div>
                        {!is_rest && blocks.length > 0 && (
                            <div className="mt-2 flex items-center gap-2.5">
                                <span className="text-xs font-bold text-muted">{blocks.length} ej · {totalSets} series</span>
                                <div className="flex items-center gap-1">
                                    {uniqueMuscles.map(m => (
                                        <span key={m} className="h-2 w-2 rounded-full" style={{ backgroundColor: getMuscleColor(m) }} title={m} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                <>
                <div className={cn('flex items-center justify-between', compact ? 'mb-2' : 'mb-4')}>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                        {dayLabel}
                        {is_rest && (
                            <span className="text-[9px] bg-surface-sunken text-muted-foreground border border-border px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                                Descanso
                            </span>
                        )}
                        {!is_rest && blocks.length > 0 && (
                            <Popover>
                                <PopoverTrigger className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-foreground">
                                    <Copy className="w-3.5 h-3.5" />
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-3 bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-card">
                                    <h4 className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">Copiar a otro día</h4>
                                    <div className="space-y-2 mb-4">
                                        {(allDays || DAYS_OF_WEEK).map(d => d.id !== dayId && (
                                            <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1.5 rounded-md">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-border accent-primary"
                                                    checked={selectedDaysToCopy.includes(d.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedDaysToCopy(prev => [...prev, d.id])
                                                        else setSelectedDaysToCopy(prev => prev.filter(x => x !== d.id))
                                                    }}
                                                />
                                                <span className="font-medium text-xs">
                                                    {isCycleMode ? `Día ${d.id}` : (d as DayState).name || `Día ${d.id}`}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full text-xs font-bold uppercase tracking-widest"
                                        disabled={selectedDaysToCopy.length === 0}
                                        onClick={() => {
                                            onCopyDay(dayId, selectedDaysToCopy)
                                            setSelectedDaysToCopy([])
                                        }}
                                    >
                                        Copiar Bloques
                                    </Button>
                                </PopoverContent>
                            </Popover>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onToggleRest(dayId)}
                            title={is_rest ? 'Marcar como día activo' : 'Marcar como descanso'}
                            className={cn(
                                'p-1.5 rounded-lg transition-colors text-xs min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center',
                                is_rest
                                    ? 'text-primary bg-primary/10 hover:bg-primary/15'
                                    : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-primary'
                            )}
                        >
                            {is_rest ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                        {!is_rest && (
                            <Badge variant="outline" className="text-muted-foreground border-border font-bold">
                                {blocks.length} ej
                            </Badge>
                        )}
                    </div>
                </div>

                {!is_rest && (
                    <>
                        <div className={cn(compact ? 'mb-1' : 'mb-3')}>
                            <input
                                value={title}
                                onChange={(e) => onUpdateTitle(dayId, e.target.value)}
                                placeholder="Título del día (ej. Empuje)"
                                maxLength={100}
                                autoComplete="off"
                                className="-mx-1 w-full rounded-md border-none bg-transparent px-1 py-0.5 font-display text-[20px] font-extrabold tracking-[-0.02em] text-strong outline-none transition-colors placeholder:text-muted-foreground/50 focus:bg-surface-sunken"
                            />
                        </div>

                        {/* Contador de Volumen por Día */}
                        {!compact && (
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Ej.</span>
                                <span className="text-[10px] font-bold text-foreground">{blocks.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Series</span>
                                <span className="text-[10px] font-bold text-foreground">{totalSets}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {uniqueMuscles.map(m => (
                                    <div key={m} className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getMuscleColor(m) }} title={m} />
                                ))}
                            </div>
                        </div>
                        )}

                        {/* Búsqueda rápida — solo desktop */}
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setIsSearchOpen(true)
                                }}
                                onFocus={() => setIsSearchOpen(true)}
                                placeholder="BUSCAR EJERCICIO..."
                                className="w-full h-11 pl-10 pr-4 text-[11px] font-bold uppercase tracking-widest rounded-control bg-black/10 dark:bg-black/40 border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground"
                            />

                            {search && isSearchOpen && (
                                <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-card overflow-hidden z-50">
                                    {filtered.length > 0 ? (
                                        <div className="py-2">
                                            <div className="px-3 pb-2 mb-2 border-b border-border text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                                Resultados Rápidos
                                            </div>
                                            {filtered.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => {
                                                        onAddExercise(dayId, ex)
                                                        setSearch('')
                                                        setIsSearchOpen(false)
                                                    }}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-muted text-sm flex font-bold uppercase tracking-widest text-foreground transition-colors group"
                                                >
                                                    <span className="truncate group-hover:text-primary transition-colors">{ex.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            No se encontraron ejercicios
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
                </>
                )}
            </div>
            )}

            <div
                ref={setNodeRef}
                className="flex-1 p-4 space-y-2 overflow-y-auto min-h-[200px]"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
                {/* Overlay para cerrar sugerencias */}
                {isSearchOpen && (
                    <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setIsSearchOpen(false)} />
                )}

                {is_rest ? (
                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground">
                        <div className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-surface-sunken text-subtle">
                            <Moon className="h-6 w-6" />
                        </div>
                        <p className="font-display text-[15px] font-extrabold text-strong">Día de descanso</p>
                        <p className="mt-1 text-[13px] text-muted px-4">No se programa entrenamiento.</p>
                        <button
                            onClick={() => onToggleRest(dayId)}
                            className="mt-4 rounded-control border border-border px-3.5 py-2 text-xs font-bold text-muted transition-colors hover:text-strong hover:bg-surface-sunken"
                        >
                            Añadir ejercicios
                        </button>
                    </div>
                ) : (
                    <SortableContext
                        items={blocks.map(b => b.uid)}
                        strategy={verticalListSortingStrategy}
                    >
                        {blocks.map((block, idx) => {
                            const nextBlock = blocks[idx + 1]
                            const sameAreaAsNext = !!nextBlock && areaKeyOf(block) === areaKeyOf(nextBlock)
                            // linkedToNext exige misma área además de misma letra: dos letras
                            // iguales en áreas distintas (dato transitorio) no dibujan "enlazado".
                            const linkedToNext =
                                !!block.superset_group && block.superset_group === nextBlock?.superset_group && sameAreaAsNext
                            const isLastBlock = idx === blocks.length - 1
                            const canLinkSuperset = !isLastBlock && !!nextBlock && sameAreaAsNext
                            // Ambos lados ya son superseries (distintas, si no serían linkedToNext):
                            // enlazar destruiría/fusionaría una (H3) → deshabilitado, no merge auto.
                            const bothGrouped = !!block.superset_group && !!nextBlock?.superset_group
                            const linkApplicable = canLinkSuperset && !bothGrouped
                            const linkTooltip = bothGrouped
                                ? 'Ya están en superseries — desagrupá primero'
                                : !sameAreaAsNext
                                    ? 'Solo puedes enlazar con el siguiente ejercicio de la misma área'
                                    : 'Agrupar como superserie con el siguiente ejercicio'
                            const linkAriaLabel = bothGrouped
                                ? 'Superserie no disponible: ambos ejercicios ya están en superseries'
                                : !sameAreaAsNext
                                    ? 'Superserie no disponible: el siguiente ejercicio es de otra área'
                                    : 'Agrupar como superserie con el siguiente ejercicio'
                            const prevKey = idx > 0 ? areaKeyOf(blocks[idx - 1]) : null
                            const thisKey = areaKeyOf(block)
                            const headerVM = thisKey !== prevKey ? areaById.get(thisKey) : undefined

                            return (
                                <div key={block.uid}>
                                    {headerVM && (
                                        <AreaDropZone
                                            dayId={dayId}
                                            area={headerVM}
                                            showDropHint={!narrowLayout}
                                            narrow={narrowLayout}
                                            count={narrowLayout ? blocks.filter(b => areaKeyOf(b) === thisKey).length : undefined}
                                        />
                                    )}
                                    <ExerciseBlock
                                        block={block}
                                        dayId={dayId}
                                        areaVMs={areaVMs}
                                        currentAreaId={thisKey}
                                        onEdit={onEditBlock}
                                        onRemove={onRemoveBlock}
                                        onUpdate={onUpdateBlock}
                                        onMoveUp={
                                            narrowLayout && onMoveBlock
                                                ? () => onMoveBlock(dayId, block.uid, -1)
                                                : undefined
                                        }
                                        onMoveDown={
                                            narrowLayout && onMoveBlock
                                                ? () => onMoveBlock(dayId, block.uid, 1)
                                                : undefined
                                        }
                                        canMoveUp={idx > 0}
                                        canMoveDown={!isLastBlock}
                                        onTapSuperset={
                                            narrowLayout
                                                ? () => onToggleSuperset(dayId, block.uid, block.superset_group ? 'unlink' : 'link')
                                                : undefined
                                        }
                                        supersetEnabled={!!block.superset_group || canLinkSuperset}
                                        supersetValid={validSupersetUids.has(block.uid)}
                                        onToggleSuperset={
                                            block.superset_group
                                                ? () => onToggleSuperset(dayId, block.uid, 'unlink')
                                                : undefined
                                        }
                                        onSetArea={
                                            onSetBlockArea
                                                ? (areaId) => onSetBlockArea(dayId, block.uid, areaId)
                                                : undefined
                                        }
                                        onToggleOverride={
                                            templateLinked && onToggleBlockOverride
                                                ? () => onToggleBlockOverride(block.uid)
                                                : undefined
                                        }
                                        showTemplateLink={!!templateLinked}
                                        isDragPending={isDragPending}
                                        narrowLayout={narrowLayout}
                                    />
                                    {/* Superset connector */}
                                    {!isLastBlock && (
                                        linkedToNext ? (
                                            <div className="flex items-center gap-2 px-3 min-h-[32px] max-md:min-h-[40px] group/ss">
                                                <div className="h-full w-px bg-primary/30 ml-3" />
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                                                        SS · {block.superset_group}
                                                    </span>
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onToggleSuperset(dayId, block.uid, 'unlink')}
                                                    title="Desagrupar superserie"
                                                    aria-label="Desagrupar superserie"
                                                    className="max-md:opacity-100 opacity-0 group-hover/ss:opacity-100 transition-opacity p-2 max-md:p-2 md:p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 flex items-center justify-center shrink-0"
                                                >
                                                    <Unlink className="w-4 h-4 md:w-3 md:h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div
                                                className={cn(
                                                    'flex items-center justify-center min-h-[40px] max-md:min-h-[44px] transition-opacity group/link max-md:opacity-100',
                                                    // Descubribilidad desktop: cuando SÍ se puede enlazar el
                                                    // conector queda persistente a baja opacidad (no invisible);
                                                    // cuando no aplica se oculta hasta hover (tooltip explica por qué).
                                                    linkApplicable
                                                        ? 'opacity-40 md:hover:opacity-100'
                                                        : 'opacity-0 md:hover:opacity-100',
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    disabled={!linkApplicable}
                                                    // Fuera del tab-order (y del árbol a11y) cuando no aplica:
                                                    // no añade ruido de teclado/lector entre cada par de bloques.
                                                    tabIndex={linkApplicable ? undefined : -1}
                                                    aria-hidden={linkApplicable ? undefined : true}
                                                    onClick={() => {
                                                        if (linkApplicable) onToggleSuperset(dayId, block.uid, 'link')
                                                    }}
                                                    title={linkTooltip}
                                                    aria-label={linkAriaLabel}
                                                    className={cn(
                                                        'flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-3 py-2 max-md:py-2.5 rounded-full border border-dashed transition-colors',
                                                        linkApplicable
                                                            ? 'text-muted-foreground max-md:text-foreground/80 border-border/70 max-md:border-primary/30 hover:text-primary hover:bg-primary/5 max-md:bg-primary/5'
                                                            : 'text-muted-foreground/50 border-border/40 cursor-not-allowed opacity-60',
                                                    )}
                                                >
                                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                                    <span>Superserie</span>
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            )
                        })}

                        {blocks.length === 0 && (
                            narrowLayout ? (
                                <div className="flex flex-col items-center rounded-card border border-dashed border-border px-6 py-8 text-center">
                                    <div className="mb-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Dumbbell className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-bold text-strong">Día vacío</p>
                                    <p className="mt-1 text-[13px] text-muted">Toca el botón + para agregar ejercicios desde el catálogo.</p>
                                </div>
                            ) : (
                            <div className="space-y-1">
                                {areaVMs.map(area => (
                                    <AreaDropZone
                                        key={area.id}
                                        dayId={dayId}
                                        area={area}
                                        showDropHint={!narrowLayout}
                                    />
                                ))}
                                <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-30 text-center pt-2 px-4">
                                    Arrastra un ejercicio o usa la búsqueda
                                </p>
                            </div>
                            )
                        )}
                    </SortableContext>
                )}
            </div>

            {/* Copiar día — bottom-sheet mobile (desktop conserva el popover) */}
            {narrowLayout && (
                <Sheet open={copySheetOpen} onOpenChange={setCopySheetOpen}>
                    <SheetContent
                        side="bottom"
                        showCloseButton={false}
                        className="gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
                    >
                        <div className="flex max-h-[80dvh] flex-col overflow-y-auto px-4 pb-4 pt-3">
                            <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                            <SheetHeader className="border-0 bg-transparent p-0">
                                <SheetTitle className="sr-only">Copiar día</SheetTitle>
                            </SheetHeader>
                            <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">Copiar día a…</h2>
                            <p className="mb-3.5 mt-1 text-[13px] text-muted">
                                Se agregan los bloques de {dayLabel} a los días elegidos.
                            </p>
                            <div className="mb-4 flex flex-wrap gap-2">
                                {(allDays || DAYS_OF_WEEK).map(d => {
                                    if (d.id === dayId) return null
                                    const sel = selectedDaysToCopy.includes(d.id)
                                    return (
                                        <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => setSelectedDaysToCopy(prev =>
                                                prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                                            )}
                                            className="h-10 rounded-control border-[1.5px] px-3.5 text-[13px] font-bold transition-colors"
                                            style={{
                                                borderColor: sel ? 'var(--sport-500)' : 'var(--border-default)',
                                                backgroundColor: sel ? 'var(--sport-100)' : 'var(--surface-card)',
                                                color: sel ? 'var(--sport-700)' : 'var(--text-body)',
                                            }}
                                        >
                                            {isCycleMode ? `Día ${d.id}` : ((d as DayState).name || `Día ${d.id}`).slice(0, 3)}
                                        </button>
                                    )
                                })}
                            </div>
                            <button
                                type="button"
                                disabled={selectedDaysToCopy.length === 0}
                                onClick={() => {
                                    onCopyDay(dayId, selectedDaysToCopy)
                                    setSelectedDaysToCopy([])
                                    setCopySheetOpen(false)
                                }}
                                className="eva-press flex h-12 w-full items-center justify-center rounded-control text-[15px] font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: 'var(--theme-primary, #2680FF)' }}
                            >
                                {selectedDaysToCopy.length
                                    ? `Copiar a ${selectedDaysToCopy.length} día(s)`
                                    : 'Elige días destino'}
                            </button>
                        </div>
                    </SheetContent>
                </Sheet>
            )}
        </div>
    )
}

export const DayColumn = React.memo(DayColumnInner)
