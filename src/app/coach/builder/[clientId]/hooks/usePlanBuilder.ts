'use client'

import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import type { BuilderBlock, BuilderSection, DayState } from '../types'
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
    | { type: 'TOGGLE_SUPERSET'; payload: { dayId: number; uid: string } }
    | { type: 'SET_BLOCK_SECTION'; payload: { dayId: number; uid: string; section: BuilderSection } }
    | { type: 'TOGGLE_OVERRIDE'; payload: { uid: string } }

function normalizedSection(b: BuilderBlock): BuilderSection {
    return b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main'
}

function builderReducer(state: DayState[], action: BuilderAction): DayState[] {
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
                    return { ...d, blocks: arrayMove(d.blocks, action.payload.oldIndex, action.payload.newIndex) }
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
                    return { ...d, blocks: d.blocks.filter((_, i) => i !== activeBlockIndex) }
                }
                if (d.id === overDayId) {
                    return { ...d, blocks: [...d.blocks, { ...activeBlock, dayId: overDayId }] }
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
                    const clonedBlocks = sourceDay.blocks.map(b => ({
                        ...b,
                        uid: `clone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        dayId: d.id
                    }))
                    return { ...d, blocks: [...d.blocks, ...clonedBlocks] }
                }
                return d
            })
        }

        case 'SET_BLOCK_SECTION': {
            const { dayId, uid, section } = action.payload
            return state.map(d => {
                if (d.id !== dayId) return d
                const block = d.blocks.find(b => b.uid === uid)
                if (!block) return d
                const rest = d.blocks.filter(b => b.uid !== uid)
                const moved: BuilderBlock = { ...block, section }
                const warmup = rest.filter(b => normalizedSection(b) === 'warmup')
                const main = rest.filter(b => normalizedSection(b) === 'main')
                const cool = rest.filter(b => normalizedSection(b) === 'cooldown')
                if (section === 'warmup') warmup.push(moved)
                else if (section === 'main') main.push(moved)
                else cool.push(moved)
                return { ...d, blocks: [...warmup, ...main, ...cool] }
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
            const { dayId, uid } = action.payload
            return state.map(d => {
                if (d.id !== dayId) return d
                const idx = d.blocks.findIndex(b => b.uid === uid)
                if (idx === -1) return d

                const block = d.blocks[idx]

                if (block.superset_group) {
                    // Remove from group; if only 1 other member remains, clear that too
                    const groupMembers = d.blocks.filter(b => b.superset_group === block.superset_group)
                    const clearAll = groupMembers.length <= 2
                    return {
                        ...d,
                        blocks: d.blocks.map(b => {
                            if (b.uid === uid) return { ...b, superset_group: null }
                            if (clearAll && b.superset_group === block.superset_group) return { ...b, superset_group: null }
                            return b
                        })
                    }
                } else {
                    // Last block can't link forward
                    if (idx === d.blocks.length - 1) return d
                    const nextBlock = d.blocks[idx + 1]
                    // Reuse next block's group, or find a new letter
                    const groupToUse = nextBlock.superset_group || (() => {
                        const usedGroups = new Set(d.blocks.map(b => b.superset_group).filter(Boolean))
                        for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
                            if (!usedGroups.has(letter)) return letter
                        }
                        return 'A'
                    })()
                    return {
                        ...d,
                        blocks: d.blocks.map((b, i) =>
                            (b.uid === uid || i === idx + 1) ? { ...b, superset_group: groupToUse } : b
                        )
                    }
                }
            })
        }

        default:
            return state
    }
}

const MAX_HISTORY = 20

export function usePlanBuilder(initialDays: DayState[]) {
    const [days, dispatch] = useReducer(builderReducer, initialDays)

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

    const toggleSuperset = useCallback((dayId: number, uid: string) => {
        dispatchWithHistory({ type: 'TOGGLE_SUPERSET', payload: { dayId, uid } })
    }, [dispatchWithHistory])

    const setBlockSection = useCallback((dayId: number, uid: string, section: BuilderSection) => {
        dispatchWithHistory({ type: 'SET_BLOCK_SECTION', payload: { dayId, uid, section } })
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
        toggleBlockOverride,
        undo,
        redo,
        canUndo,
        canRedo,
    }
}
