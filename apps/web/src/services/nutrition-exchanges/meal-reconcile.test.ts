import { describe, it, expect } from 'vitest'
import { reconcileMealsById } from './meal-reconcile'

/**
 * Unit del re-mapeo (mustFix R1): la prescripción por porciones viaja SIEMPRE con su
 * comida. El matching legacy por order_index barajaba targets/variantes tras
 * reordenar o borrar comidas (corrupción silenciosa en DB y en la app del alumno).
 */

type Meal = { name: string; order_index: number }
const meal = (name: string, order_index: number): Meal => ({ name, order_index })

describe('reconcileMealsById (R1: match por ID, jamás por posición)', () => {
    it('reordenar comidas ⇒ cada fila conserva SU contenido', () => {
        // DB: Desayuno(A,0), Almuerzo(B,1), Cena(C,2). El coach arrastra Cena al inicio.
        const res = reconcileMealsById(
            ['A', 'B', 'C'],
            [
                { dbId: 'C', item: meal('Cena', 0) },
                { dbId: 'A', item: meal('Desayuno', 1) },
                { dbId: 'B', item: meal('Almuerzo', 2) },
            ]
        )
        expect(res.toDelete).toEqual([])
        expect(res.toInsert).toEqual([])
        // Con el match legacy por posición, la fila A heredaba 'Cena' (y sus targets
        // quedaban pegados a la comida equivocada). Acá cada id conserva su comida:
        expect(res.toUpdate).toEqual([
            { existingId: 'C', item: meal('Cena', 0) },
            { existingId: 'A', item: meal('Desayuno', 1) },
            { existingId: 'B', item: meal('Almuerzo', 2) },
        ])
    })

    it('borrar una comida INTERMEDIA elimina ESA fila (no la última)', () => {
        // DB: A(0), B(1), C(2). El coach borra B. Legacy borraba C (la última) y el
        // CASCADE se llevaba los targets de C en vez de los de B.
        const res = reconcileMealsById(
            ['A', 'B', 'C'],
            [
                { dbId: 'A', item: meal('Desayuno', 0) },
                { dbId: 'C', item: meal('Cena', 1) },
            ]
        )
        expect(res.toDelete).toEqual(['B'])
        expect(res.toUpdate.map((u) => u.existingId)).toEqual(['A', 'C'])
        expect(res.toInsert).toEqual([])
    })

    it('reordenar + borrar combinados: ids correctos sobreviven con su contenido', () => {
        const res = reconcileMealsById(
            ['A', 'B', 'C', 'D'],
            [
                { dbId: 'D', item: meal('Cena', 0) },
                { dbId: 'B', item: meal('Almuerzo', 1) },
            ]
        )
        expect(res.toDelete).toEqual(['A', 'C'])
        expect(res.toUpdate).toEqual([
            { existingId: 'D', item: meal('Cena', 0) },
            { existingId: 'B', item: meal('Almuerzo', 1) },
        ])
    })

    it('comida nueva sin id ⇒ insert (no roba la fila de otra)', () => {
        const res = reconcileMealsById(
            ['A'],
            [
                { dbId: 'A', item: meal('Desayuno', 0) },
                { dbId: null, item: meal('Colación', 1) },
            ]
        )
        expect(res.toUpdate).toEqual([{ existingId: 'A', item: meal('Desayuno', 0) }])
        expect(res.toInsert).toEqual([meal('Colación', 1)])
        expect(res.toDelete).toEqual([])
    })

    it('id que ya no existe en el plan ⇒ insert defensivo (no toca filas ajenas)', () => {
        const res = reconcileMealsById(
            ['A'],
            [
                { dbId: 'ZZ-borrado-en-otra-sesion', item: meal('Once', 0) },
            ]
        )
        expect(res.toInsert).toEqual([meal('Once', 0)])
        // La fila A no fue reclamada por nadie ⇒ el coach la eliminó en SU estado local.
        expect(res.toDelete).toEqual(['A'])
        expect(res.toUpdate).toEqual([])
    })

    it('dbId duplicado en el payload ⇒ solo el primero actualiza; el resto inserta', () => {
        const res = reconcileMealsById(
            ['A'],
            [
                { dbId: 'A', item: meal('Desayuno', 0) },
                { dbId: 'A', item: meal('Clon', 1) },
            ]
        )
        expect(res.toUpdate).toEqual([{ existingId: 'A', item: meal('Desayuno', 0) }])
        expect(res.toInsert).toEqual([meal('Clon', 1)])
        expect(res.toDelete).toEqual([])
    })

    it('payload vacío ⇒ borra todas las existentes', () => {
        const res = reconcileMealsById(['A', 'B'], [])
        expect(res.toDelete).toEqual(['A', 'B'])
        expect(res.toUpdate).toEqual([])
        expect(res.toInsert).toEqual([])
    })

    it('sin comidas existentes ⇒ todo inserta', () => {
        const res = reconcileMealsById([], [{ dbId: null, item: meal('Desayuno', 0) }])
        expect(res.toInsert).toEqual([meal('Desayuno', 0)])
        expect(res.toDelete).toEqual([])
        expect(res.toUpdate).toEqual([])
    })
})
