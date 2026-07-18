import { describe, it, expect } from 'vitest'
import { reconcileMeals, type ReconcileTemplateMeal } from './nutrition-sync'

const tmeal = (order_index: number, name = `meal-${order_index}`): ReconcileTemplateMeal => ({
    order_index,
    name,
    description: '',
    day_of_week: null,
})

describe('reconcileMeals — propagación de plantilla a planes de alumnos', () => {
    it('E1: comida existente cuyo order_index sigue en la plantilla -> UPDATE in-place (id preservado, NO borrar)', () => {
        const r = reconcileMeals(
            [{ id: 'meal-a', order_index: 0 }, { id: 'meal-b', order_index: 1 }],
            [tmeal(0), tmeal(1)],
            new Set()
        )
        expect(r.toDelete).toEqual([])
        expect(r.toInsert).toEqual([])
        expect(r.toUpdate.map((u) => u.id).sort()).toEqual(['meal-a', 'meal-b'])
        // los ids se conservan -> nutrition_meal_logs siguen válidos
        expect(r.toUpdate.find((u) => u.order_index === 0)?.id).toBe('meal-a')
    })

    it('ORFANDAD (CRÍTICO): comida eliminada de la plantilla PERO con logs -> NO se borra (se conserva)', () => {
        // plan tiene comida en order_index=3 con historial; la plantilla ya no la incluye
        const r = reconcileMeals(
            [{ id: 'meal-a', order_index: 0 }, { id: 'meal-logged', order_index: 3 }],
            [tmeal(0)], // plantilla sin order_index=3
            new Set(['meal-logged'])
        )
        expect(r.toDelete).not.toContain('meal-logged')
        expect(r.toDelete).toEqual([]) // nada borrable
        expect(r.preservedWithLogs).toEqual(['meal-logged'])
    })

    it('comida huérfana SIN logs -> sí se borra', () => {
        const r = reconcileMeals(
            [{ id: 'meal-a', order_index: 0 }, { id: 'meal-orphan', order_index: 5 }],
            [tmeal(0)],
            new Set() // sin logs
        )
        expect(r.toDelete).toEqual(['meal-orphan'])
        expect(r.preservedWithLogs).toEqual([])
    })

    it('cliente NUEVO (sin comidas existentes) -> exactamente N inserts, 0 update, 0 delete', () => {
        const template = [tmeal(0), tmeal(1), tmeal(2)]
        const r = reconcileMeals([], template, new Set())
        expect(r.toInsert).toHaveLength(3) // N exactas, no 2N
        expect(r.toUpdate).toEqual([])
        expect(r.toDelete).toEqual([])
        expect(r.toInsert.map((t) => t.order_index)).toEqual([0, 1, 2])
    })

    it('reorden: comida con logs cuyo order_index ya no está en la plantilla -> NO se borra (cascade-safe)', () => {
        // coach quitó/movió la comida del índice 2; esa comida tiene logs
        const r = reconcileMeals(
            [{ id: 'm0', order_index: 0 }, { id: 'm-logged', order_index: 2 }],
            [tmeal(0), tmeal(1)], // ahora hay un índice 1 nuevo, el 2 desapareció
            new Set(['m-logged'])
        )
        expect(r.toDelete).not.toContain('m-logged')
        expect(r.preservedWithLogs).toContain('m-logged')
        // el índice 1 nuevo se inserta; el 0 se updatea
        expect(r.toInsert.map((t) => t.order_index)).toEqual([1])
        expect(r.toUpdate.map((u) => u.id)).toEqual(['m0'])
    })

    it('mix: update + insert + delete-sin-logs + preserve-con-logs en una sola pasada', () => {
        const r = reconcileMeals(
            [
                { id: 'keep', order_index: 0 }, // sigue -> update
                { id: 'drop', order_index: 7 }, // fuera, sin logs -> delete
                { id: 'hist', order_index: 8 }, // fuera, con logs -> preserve
            ],
            [tmeal(0), tmeal(1)], // 0 update, 1 insert
            new Set(['hist'])
        )
        expect(r.toUpdate.map((u) => u.id)).toEqual(['keep'])
        expect(r.toInsert.map((t) => t.order_index)).toEqual([1])
        expect(r.toDelete).toEqual(['drop'])
        expect(r.preservedWithLogs).toEqual(['hist'])
    })
})
