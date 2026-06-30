import { describe, it, expect } from 'vitest'
import { matchPlans, diffBlocksByPosition, type ExistingPlan } from './workout-save-reconcile'

describe('matchPlans', () => {
    const existing: ExistingPlan[] = [
        { id: 'p-mon-a', day_of_week: 1, week_variant: 'A', blocks: [] },
        { id: 'p-wed-a', day_of_week: 3, week_variant: null, blocks: [] }, // null => 'A'
        { id: 'p-mon-b', day_of_week: 1, week_variant: 'B', blocks: [] },
    ]

    it('reusa el plan por (day_of_week, variante); null === A', () => {
        const r = matchPlans(existing, [
            { day_of_week: 1, week_variant: 'A' },
            { day_of_week: 3, week_variant: 'A' },
        ])
        expect(r.reuse).toEqual([
            { desiredIndex: 0, planId: 'p-mon-a' },
            { desiredIndex: 1, planId: 'p-wed-a' },
        ])
        expect(r.insertDesiredIndexes).toEqual([])
        expect(r.deletePlanIds).toEqual(['p-mon-b']) // ya no se desea → borrar (logs sobreviven SET NULL)
    })

    it('día deseado sin plan existente → insert', () => {
        const r = matchPlans(existing, [{ day_of_week: 5, week_variant: 'A' }])
        expect(r.reuse).toEqual([])
        expect(r.insertDesiredIndexes).toEqual([0])
        expect(r.deletePlanIds.sort()).toEqual(['p-mon-a', 'p-mon-b', 'p-wed-a'])
    })

    it('A/B: empareja ambas variantes del mismo día', () => {
        const r = matchPlans(existing, [
            { day_of_week: 1, week_variant: 'A' },
            { day_of_week: 1, week_variant: 'B' },
        ])
        expect(r.reuse).toEqual([
            { desiredIndex: 0, planId: 'p-mon-a' },
            { desiredIndex: 1, planId: 'p-mon-b' },
        ])
        expect(r.deletePlanIds).toEqual(['p-wed-a'])
    })

    it('sin planes existentes → todo insert', () => {
        const r = matchPlans([], [{ day_of_week: 1, week_variant: 'A' }])
        expect(r.insertDesiredIndexes).toEqual([0])
        expect(r.deletePlanIds).toEqual([])
    })
})

describe('diffBlocksByPosition', () => {
    const blocks = (ids: string[]) => ids.map((id, i) => ({ id, order_index: i }))

    it('mismo conteo → todos update en sitio (preserva ids/logs)', () => {
        const r = diffBlocksByPosition(blocks(['b0', 'b1', 'b2']), 3)
        expect(r.ops).toEqual([
            { kind: 'update', id: 'b0', desiredIndex: 0 },
            { kind: 'update', id: 'b1', desiredIndex: 1 },
            { kind: 'update', id: 'b2', desiredIndex: 2 },
        ])
        expect(r.deleteIds).toEqual([])
    })

    it('más deseados → update los existentes + insert el resto', () => {
        const r = diffBlocksByPosition(blocks(['b0', 'b1']), 4)
        expect(r.ops).toEqual([
            { kind: 'update', id: 'b0', desiredIndex: 0 },
            { kind: 'update', id: 'b1', desiredIndex: 1 },
            { kind: 'insert', desiredIndex: 2 },
            { kind: 'insert', desiredIndex: 3 },
        ])
        expect(r.deleteIds).toEqual([])
    })

    it('menos deseados → update los primeros + delete sobrantes', () => {
        const r = diffBlocksByPosition(blocks(['b0', 'b1', 'b2', 'b3']), 2)
        expect(r.ops).toEqual([
            { kind: 'update', id: 'b0', desiredIndex: 0 },
            { kind: 'update', id: 'b1', desiredIndex: 1 },
        ])
        expect(r.deleteIds).toEqual(['b2', 'b3'])
    })

    it('cero deseados → borra todos', () => {
        const r = diffBlocksByPosition(blocks(['b0', 'b1']), 0)
        expect(r.ops).toEqual([])
        expect(r.deleteIds).toEqual(['b0', 'b1'])
    })

    it('ordena por order_index antes de diffear', () => {
        const r = diffBlocksByPosition(
            [{ id: 'second', order_index: 5 }, { id: 'first', order_index: 1 }],
            1
        )
        expect(r.ops).toEqual([{ kind: 'update', id: 'first', desiredIndex: 0 }])
        expect(r.deleteIds).toEqual(['second'])
    })
})
