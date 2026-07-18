import { describe, expect, it } from 'vitest'
import {
    diffBlocksByPosition,
    hasProgramOptimisticConflict,
    matchPlans,
    type ExistingPlan,
} from './workout-save-reconcile'

describe('matchPlans', () => {
    const existing: ExistingPlan[] = [
        { id: 'p-mon-a', day_of_week: 1, week_variant: 'A', blocks: [] },
        { id: 'p-wed-a', day_of_week: 3, week_variant: null, blocks: [] },
        { id: 'p-mon-b', day_of_week: 1, week_variant: 'B', blocks: [] },
    ]

    it('reusa por día/variante y trata null como A', () => {
        expect(matchPlans(existing, [
            { day_of_week: 1, week_variant: 'A' },
            { day_of_week: 3, week_variant: 'A' },
        ])).toEqual({
            reuse: [
                { desiredIndex: 0, planId: 'p-mon-a' },
                { desiredIndex: 1, planId: 'p-wed-a' },
            ],
            insertDesiredIndexes: [],
            deletePlanIds: ['p-mon-b'],
        })
    })

    it('preserva A/B del mismo día y marca inserts/deletes', () => {
        expect(matchPlans(existing, [
            { day_of_week: 1, week_variant: 'A' },
            { day_of_week: 1, week_variant: 'B' },
            { day_of_week: 5, week_variant: 'A' },
        ])).toEqual({
            reuse: [
                { desiredIndex: 0, planId: 'p-mon-a' },
                { desiredIndex: 1, planId: 'p-mon-b' },
            ],
            insertDesiredIndexes: [2],
            deletePlanIds: ['p-wed-a'],
        })
    })
})

describe('diffBlocksByPosition', () => {
    it('ordena, actualiza ids existentes, inserta faltantes y borra sobrantes', () => {
        expect(diffBlocksByPosition([
            { id: 'second', order_index: 5 },
            { id: 'first', order_index: 1 },
        ], 3)).toEqual({
            ops: [
                { kind: 'update', id: 'first', desiredIndex: 0 },
                { kind: 'update', id: 'second', desiredIndex: 1 },
                { kind: 'insert', desiredIndex: 2 },
            ],
            deleteIds: [],
        })

        expect(diffBlocksByPosition([
            { id: 'b0', order_index: 0 },
            { id: 'b1', order_index: 1 },
        ], 1)).toEqual({
            ops: [{ kind: 'update', id: 'b0', desiredIndex: 0 }],
            deleteIds: ['b1'],
        })
    })
})

describe('hasProgramOptimisticConflict', () => {
    it('solo detecta una fila actual distinta con snapshot y sin force', () => {
        expect(hasProgramOptimisticConflict({
            expectedUpdatedAt: '2026-07-12T10:00:00Z',
            currentUpdatedAt: '2026-07-12T10:01:00Z',
        })).toBe(true)
        expect(hasProgramOptimisticConflict({
            expectedUpdatedAt: '2026-07-12T10:00:00Z',
            currentUpdatedAt: '2026-07-12T10:00:00Z',
        })).toBe(false)
        expect(hasProgramOptimisticConflict({
            expectedUpdatedAt: '2026-07-12T10:00:00Z',
            currentUpdatedAt: '2026-07-12T10:01:00Z',
            force: true,
        })).toBe(false)
        expect(hasProgramOptimisticConflict({ currentUpdatedAt: '2026-07-12T10:01:00Z' })).toBe(false)
        expect(hasProgramOptimisticConflict({ expectedUpdatedAt: '2026-07-12T10:00:00Z' })).toBe(false)
    })
})
