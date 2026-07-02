'use client'

import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import type { BuilderBlock, BuilderSection, DayState } from '../types'
import type { WorkoutArea } from '@/domain/workout/types'
import {
    LEGACY_SECTION_AREA_ID,
    classicSlugForAreaId,
    effectiveAreaKey,
    legacyBucketFor,
    orderedAreaIds,
} from '@/lib/workout-areas'
import { sanitizeSupersets } from '@/lib/workout-block-grouping'
import { arrayMove } from '@dnd-kit/sortable'

export const DAYS_OF_WEEK = [
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
    { id: 7, name: 'Domingo' }
]

type BuilderAction =
    | { type: 'SET_DAYS'; payload: DayState[] }
    | { type: 'ADD_BLOCK'; payload: { dayId: number; block: BuilderBlock } }
    | { type: 'REMOVE_BLOCK'; payload: { dayId: number; uid: string } }
    | { type: 'UPDATE_BLOCK'; payload: { block: BuilderBlock } }
    | { type: 'MOVE_BLOCK'; payload: { dayId: number; oldIndex: number; newIndex: number } }
    | { type: 'TRANSFER_BLOCK'; payload: { activeId: string; activeDayId: number; overDayId: number } }
    | { type: 'UPDATE_DAY_TITLE'; payload: { dayId: number; title: string } }
    | { type: 'COPY_DAY'; payload: { sourceId: number; targetIds: number[] } }
    | { type: 'TOGGLE_REST_DAY'; payload: { dayId: number } }
    | { type: 'TOGGLE_SUPERSET'; payload: { dayId: number; uid: string; intent?: 'link' | 'unlink' } }
    | { type: 'SET_BLOCK_SECTION'; payload: { dayId: number; uid: string; section: BuilderSection } }
    | { type: 'SET_BLOCK_AREA'; payload: { dayId: number; uid: string; areaId: string } }
    | { type: 'TOGGLE_OVERRIDE'; payload: { uid: string } }

export type { BuilderAction }

/** Primera letra A-Z no usada por ningún grupo de superserie del día (fallback 'A'). */
function nextFreeSupersetLetter(used: ReadonlySet<string>): string {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (!used.has(letter)) return letter
    }
    return 'A'
}

/**
 * Normaliza las superseries de un día (colapsa huérfanos, re-letra tramos partidos)
 * usando la MISMA resolución de área que el reducer (`effectiveAreaKey` con las áreas
 * conocidas). Idempotente: devuelve el MISMO array por referencia si no hay nada que
 * reparar, por lo que aplicarlo tras un MOVE/TRANSFER no ensucia diffs ni undo/redo.
 */
function sanitizeDayBlocks(blocks: BuilderBlock[], areas: readonly WorkoutArea[]): BuilderBlock[] {
    const knownAreaIds = new Set(orderedAreaIds(areas))
    return sanitizeSupersets(blocks, b => effectiveAreaKey(b, knownAreaIds))
}

export function builderReducer(
    state: DayState[],
    action: BuilderAction,
    areas: readonly WorkoutArea[] = []
): DayState[] {
    switch (action.type) {
        case 'SET_DAYS':
            return action.payload

        case 'ADD_BLOCK':
            return state.map(d => {
                if (d.id === action.payload.dayId) {
                    return { ...d, blocks: [...d.blocks, action.payload.block] }
                }
                return d
            })

        case 'REMOVE_BLOCK':
            return state.map(d => {
                if (d.id === action.payload.dayId) {
                    return { ...d, blocks: d.blocks.filter(b => b.uid !== action.payload.uid) }
                }
                return d
            })

        case 'UPDATE_BLOCK':
            return state.map(d => ({
                ...d,
                blocks: d.blocks.map(b => b.uid === action.payload.block.uid ? action.payload.block : b)
            }))

        case 'MOVE_BLOCK':
            return state.map(d => {
                if (d.id === action.payload.dayId) {
                    // Reordenar por drag/rail puede partir un grupo (bloque suelto al medio) o
                    // dejar un miembro huérfano: renormalizamos como parte de la MISMA transición.
                    const moved = arrayMove(d.blocks, action.payload.oldIndex, action.payload.newIndex)
                    return { ...d, blocks: sanitizeDayBlocks(moved, areas) }
                }
                return d
            })

        case 'TRANSFER_BLOCK': {
            const { activeId, activeDayId, overDayId } = action.payload
            const activeDay = state.find(d => d.id === activeDayId)
            const overDay = state.find(d => d.id === overDayId)

            if (!activeDay || !overDay) return state

            const activeBlockIndex = activeDay.blocks.findIndex(b => b.uid === activeId)
            if (activeBlockIndex === -1) return state

            const activeBlock = activeDay.blocks[activeBlockIndex]

            return state.map(d => {
                if (d.id === activeDayId) {
                    // Origen: quitar el bloque puede dejar el grupo no contiguo/huérfano → renormalizar.
                    const remaining = d.blocks.filter((_, i) => i !== activeBlockIndex)
                    return { ...d, blocks: sanitizeDayBlocks(remaining, areas) }
                }
                if (d.id === overDayId) {
                    // El bloque movido LIMPIA su superset_group antes de aterrizar (mismo criterio
                    // que SET_BLOCK_AREA): llega suelto, nunca arrastra su letra ni fusiona un
                    // grupo ajeno del destino que casualmente termine con la misma letra (H1).
                    const appended = [...d.blocks, { ...activeBlock, dayId: overDayId, superset_group: null }]
                    return { ...d, blocks: sanitizeDayBlocks(appended, areas) }
                }
                return d
            })
        }

        case 'UPDATE_DAY_TITLE':
            return state.map(d => d.id === action.payload.dayId ? { ...d, title: action.payload.title } : d)

        case 'TOGGLE_REST_DAY':
            return state.map(d => d.id === action.payload.dayId ? { ...d, is_rest: !d.is_rest } : d)

        case 'COPY_DAY': {
            const { sourceId, targetIds } = action.payload
            const sourceDay = state.find(d => d.id === sourceId)
            if (!sourceDay) return state

            return state.map(d => {
                if (targetIds.includes(d.id)) {
                    // Re-letramos los grupos de superserie copiados a letras libres en el
                    // destino: preserva el agrupamiento dentro de la copia pero evita
                    // fusionar con un grupo ajeno del destino (sobre todo en la costura,
                    // donde un grupo copiado quedaría contiguo a uno existente con la misma letra).
                    const usedGroups = new Set(
                        d.blocks.map(b => b.superset_group).filter((g): g is string => !!g)
                    )
                    const remap = new Map<string, string>()
                    const clonedBlocks = sourceDay.blocks.map(b => {
                        const srcGroup = b.superset_group?.trim() || null
                        let group: string | null = srcGroup
                        if (srcGroup) {
                            let mapped = remap.get(srcGroup)
                            if (!mapped) {
                                mapped = nextFreeSupersetLetter(usedGroups)
                                usedGroups.add(mapped)
                                remap.set(srcGroup, mapped)
                            }
                            group = mapped
                        }
                        return {
                            ...b,
                            uid: `clone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            dayId: d.id,
                            superset_group: group,
                        }
                    })
                    return { ...d, blocks: [...d.blocks, ...clonedBlocks] }
                }
                return d
            })
        }

        case 'SET_BLOCK_SECTION': {
            // Compat legacy: delega en SET_BLOCK_AREA con el area system equivalente
            // (mantiene section y section_template_id sincronizados).
            const { dayId, uid, section } = action.payload
            return builderReducer(
                state,
                { type: 'SET_BLOCK_AREA', payload: { dayId, uid, areaId: LEGACY_SECTION_AREA_ID[section] } },
                areas
            )
        }

        case 'SET_BLOCK_AREA': {
            const { dayId, uid, areaId } = action.payload
            return state.map(d => {
                if (d.id !== dayId) return d
                const block = d.blocks.find(b => b.uid === uid)
                if (!block) return d

                const area = areas.find(a => a.id === areaId) ?? null
                const bucket: BuilderSection = area
                    ? legacyBucketFor(area)
                    : (classicSlugForAreaId(areaId) ?? 'main')

                // Mover de area rompe la superserie completa del bloque (igual que el legacy)
                const groupId = block.superset_group?.trim() || null
                const rest = d.blocks
                    .filter(b => b.uid !== uid)
                    .map(b => {
                        if (groupId && b.superset_group === groupId) {
                            return { ...b, superset_group: null }
                        }
                        return b
                    })
                const moved: BuilderBlock = { ...block, section: bucket, section_template_id: areaId, superset_group: null }

                // Reagrupar el dia por area en orden sort_order; areas desconocidas caen al
                // bucket legacy y un barrido final garantiza no perder NINGUN bloque.
                const order = orderedAreaIds(areas)
                const known = new Set(order)
                const groups = new Map<string, BuilderBlock[]>()
                for (const b of rest) {
                    const key = effectiveAreaKey(b, known)
                    const group = groups.get(key)
                    if (group) group.push(b)
                    else groups.set(key, [b])
                }
                const targetKey = known.has(areaId) ? areaId : LEGACY_SECTION_AREA_ID[bucket]
                const targetGroup = groups.get(targetKey)
                if (targetGroup) targetGroup.push(moved)
                else groups.set(targetKey, [moved])

                const blocks: BuilderBlock[] = []
                const used = new Set<string>()
                for (const id of order) {
                    const group = groups.get(id)
                    if (group) {
                        blocks.push(...group)
                        used.add(id)
                    }
                }
                for (const [id, group] of groups) {
                    if (!used.has(id)) blocks.push(...group)
                }
                return { ...d, blocks }
            })
        }

        case 'TOGGLE_OVERRIDE': {
            const { uid } = action.payload
            return state.map(d => ({
                ...d,
                blocks: d.blocks.map(b => (b.uid === uid ? { ...b, is_override: !b.is_override } : b)),
            }))
        }

        case 'TOGGLE_SUPERSET': {
            const { dayId, uid, intent } = action.payload
            return state.map(d => {
                if (d.id !== dayId) return d
                const idx = d.blocks.findIndex(b => b.uid === uid)
                if (idx === -1) return d

                const block = d.blocks[idx]
                const nextBlock = d.blocks[idx + 1]
                const knownAreaIds = new Set(orderedAreaIds(areas))
                const group = block.superset_group?.trim() || null
                const linkedToNext = !!group && (nextBlock?.superset_group ?? null) === group

                // EXTENDER (fix bug 1): el bloque es el ÚLTIMO miembro de su grupo y el
                // siguiente está libre y en la misma área efectiva → ampliamos el tramo
                // contiguo con la misma letra en vez de romper el grupo.
                if (
                    // El badge "Quitar de la superserie" (intent 'unlink') NUNCA extiende: solo el
                    // conector "Agrupar/Superserie" (intent 'link' o sin intent) amplía el tramo.
                    intent !== 'unlink' &&
                    group &&
                    !linkedToNext &&
                    nextBlock &&
                    !nextBlock.superset_group &&
                    effectiveAreaKey(block, knownAreaIds) === effectiveAreaKey(nextBlock, knownAreaIds)
                ) {
                    return {
                        ...d,
                        blocks: d.blocks.map((b, i) =>
                            i === idx + 1 ? { ...b, superset_group: group } : b
                        ),
                    }
                }

                if (group) {
                    // QUITAR / PARTIR (fix bug 3): el bloque deja su grupo. Vaciar un miembro
                    // del medio puede partir el grupo en tramos no contiguos con la misma letra.
                    // Re-letramos los tramos sobrantes y descartamos singletons para no
                    // persistir grupos inconsistentes (un superset exige ≥2 bloques contiguos).
                    const cleared = d.blocks.map((b, i) =>
                        i === idx ? { ...b, superset_group: null } : b
                    )
                    const used = new Set(
                        cleared.map(b => b.superset_group).filter((g): g is string => !!g)
                    )
                    let runsKept = 0
                    let i = 0
                    while (i < cleared.length) {
                        if (cleared[i].superset_group !== group) {
                            i += 1
                            continue
                        }
                        let j = i
                        while (j < cleared.length && cleared[j].superset_group === group) j += 1
                        const runLen = j - i
                        if (runLen === 1) {
                            // Tramo de 1 → ya no es superset, se limpia.
                            cleared[i] = { ...cleared[i], superset_group: null }
                        } else {
                            runsKept += 1
                            // El primer tramo sobreviviente conserva la letra original; los
                            // siguientes reciben una letra nueva para no quedar no-contiguos.
                            if (runsKept > 1) {
                                const letter = nextFreeSupersetLetter(used)
                                used.add(letter)
                                for (let k = i; k < j; k += 1) {
                                    cleared[k] = { ...cleared[k], superset_group: letter }
                                }
                            }
                        }
                        i = j
                    }
                    return { ...d, blocks: cleared }
                }

                // ENLAZAR hacia adelante (crear grupo o unirse al del siguiente).
                if (idx === d.blocks.length - 1) return d
                if (!nextBlock) return d
                // Solo se enlazan bloques de la MISMA area efectiva (legacy: misma seccion)
                if (effectiveAreaKey(block, knownAreaIds) !== effectiveAreaKey(nextBlock, knownAreaIds)) return d
                const usedGroups = new Set(
                    d.blocks.map(b => b.superset_group).filter((g): g is string => !!g)
                )
                const groupToUse = nextBlock.superset_group || nextFreeSupersetLetter(usedGroups)
                return {
                    ...d,
                    blocks: d.blocks.map((b, i) =>
                        (b.uid === uid || i === idx + 1) ? { ...b, superset_group: groupToUse } : b
                    ),
                }
            })
        }

        default:
            return state
    }
}

const MAX_HISTORY = 20

export function usePlanBuilder(initialDays: DayState[], areas: readonly WorkoutArea[] = []) {
    // Las areas llegan por props (RSC) y el reducer las lee via ref para no recrear el estado.
    const areasRef = useRef(areas)
    useEffect(() => { areasRef.current = areas }, [areas])
    const boundReducer = useCallback(
        (state: DayState[], action: BuilderAction) => builderReducer(state, action, areasRef.current),
        []
    )
    // Falso positivo: boundReducer solo corre en dispatch (eventos/DnD), nunca en el render inicial
    // (initializer no-lazy), por lo que leer areasRef.current dentro del reducer es correcto e intencional.
    // eslint-disable-next-line react-hooks/refs
    const [days, dispatch] = useReducer(boundReducer, initialDays)

    // History tracking via refs to avoid extra re-renders on every change
    const historyRef = useRef<DayState[][]>([])
    const futureRef = useRef<DayState[][]>([])
    const daysRef = useRef(days)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    useEffect(() => { daysRef.current = days }, [days])

    const dispatchWithHistory = useCallback((action: BuilderAction) => {
        historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), daysRef.current]
        futureRef.current = []
        setCanUndo(true)
        setCanRedo(false)
        dispatch(action)
    }, [])

    const undo = useCallback(() => {
        if (historyRef.current.length === 0) return
        const prev = historyRef.current[historyRef.current.length - 1]
        futureRef.current = [daysRef.current, ...futureRef.current.slice(0, MAX_HISTORY - 1)]
        historyRef.current = historyRef.current.slice(0, -1)
        setCanUndo(historyRef.current.length > 0)
        setCanRedo(true)
        dispatch({ type: 'SET_DAYS', payload: prev })
    }, [])

    const redo = useCallback(() => {
        if (futureRef.current.length === 0) return
        const next = futureRef.current[0]
        historyRef.current = [...historyRef.current, daysRef.current]
        futureRef.current = futureRef.current.slice(1)
        setCanUndo(true)
        setCanRedo(futureRef.current.length > 0)
        dispatch({ type: 'SET_DAYS', payload: next })
    }, [])

    const addExercise = useCallback((dayId: number, block: BuilderBlock) => {
        dispatchWithHistory({ type: 'ADD_BLOCK', payload: { dayId, block } })
    }, [dispatchWithHistory])

    const removeBlock = useCallback((dayId: number, uid: string) => {
        dispatchWithHistory({ type: 'REMOVE_BLOCK', payload: { dayId, uid } })
    }, [dispatchWithHistory])

    const updateBlock = useCallback((block: BuilderBlock) => {
        dispatchWithHistory({ type: 'UPDATE_BLOCK', payload: { block } })
    }, [dispatchWithHistory])

    const updateDayTitle = useCallback((dayId: number, title: string) => {
        dispatchWithHistory({ type: 'UPDATE_DAY_TITLE', payload: { dayId, title } })
    }, [dispatchWithHistory])

    const copyDay = useCallback((sourceId: number, targetIds: number[]) => {
        dispatchWithHistory({ type: 'COPY_DAY', payload: { sourceId, targetIds } })
    }, [dispatchWithHistory])

    const toggleRestDay = useCallback((dayId: number) => {
        dispatchWithHistory({ type: 'TOGGLE_REST_DAY', payload: { dayId } })
    }, [dispatchWithHistory])

    const toggleSuperset = useCallback((dayId: number, uid: string, intent?: 'link' | 'unlink') => {
        dispatchWithHistory({ type: 'TOGGLE_SUPERSET', payload: { dayId, uid, intent } })
    }, [dispatchWithHistory])

    const setBlockSection = useCallback((dayId: number, uid: string, section: BuilderSection) => {
        dispatchWithHistory({ type: 'SET_BLOCK_SECTION', payload: { dayId, uid, section } })
    }, [dispatchWithHistory])

    const setBlockArea = useCallback((dayId: number, uid: string, areaId: string) => {
        dispatchWithHistory({ type: 'SET_BLOCK_AREA', payload: { dayId, uid, areaId } })
    }, [dispatchWithHistory])

    const toggleBlockOverride = useCallback((uid: string) => {
        dispatchWithHistory({ type: 'TOGGLE_OVERRIDE', payload: { uid } })
    }, [dispatchWithHistory])

    return {
        days,
        dispatch,             // raw dispatch — use for DnD drag-over (no history entry)
        dispatchWithHistory,  // history-aware — use for all user-initiated actions
        addExercise,
        removeBlock,
        updateBlock,
        updateDayTitle,
        copyDay,
        toggleRestDay,
        toggleSuperset,
        setBlockSection,
        setBlockArea,
        toggleBlockOverride,
        undo,
        redo,
        canUndo,
        canRedo,
    }
}
