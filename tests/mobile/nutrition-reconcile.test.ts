// Adaptador PURO de cascade-safety de nutrición mobile (G08 §2.2, DATA-LOSS).
// El módulo bajo test (apps/mobile/lib/nutrition-reconcile) es puro (no toca supabase/RN),
// así que corre con el runner del repo. Vitest lo colecta por el glob `tests/**`.
// Verifica el MAPEO de filas mobile -> input de reconcileMeals + que la decisión compartida
// (reconcileMeals de @eva/nutrition-engine) preserva las comidas con logs al reducir comidas.
import { describe, it, expect } from 'vitest'
import { reconcileMeals } from '@eva/nutrition-engine'
import { buildMealReconcileInput, type ReconcileDraftMeal } from '../../apps/mobile/lib/nutrition-reconcile'

const draft = (name: string): ReconcileDraftMeal => ({ name, description: '', day_of_week: null })

describe('buildMealReconcileInput (adaptador mobile)', () => {
  it('re-indexa las comidas del draft a 0..n-1 (convención de order_index del save-path)', () => {
    const { templateMeals } = buildMealReconcileInput([], [draft('Desayuno'), draft('Almuerzo'), draft('Cena')])
    expect(templateMeals.map((t) => t.order_index)).toEqual([0, 1, 2])
    expect(templateMeals[0].name).toBe('Desayuno')
    expect(templateMeals[2].name).toBe('Cena')
  })

  it('removalCandidates = comidas existentes cuyo order_index quedó fuera del nuevo conteo', () => {
    // el plan tenía 4 comidas (0..3); el draft ahora tiene 2 (se re-indexa a 0,1)
    const { removalCandidates } = buildMealReconcileInput(
      [
        { id: 'm0', order_index: 0 },
        { id: 'm1', order_index: 1 },
        { id: 'm2', order_index: 2 },
        { id: 'm3', order_index: 3 },
      ],
      [draft('a'), draft('b')]
    )
    expect(removalCandidates.sort()).toEqual(['m2', 'm3'])
  })

  it('sin recortes (mismo conteo) -> no hay candidatos a borrar', () => {
    const { removalCandidates } = buildMealReconcileInput(
      [{ id: 'm0', order_index: 0 }, { id: 'm1', order_index: 1 }],
      [draft('a'), draft('b')]
    )
    expect(removalCandidates).toEqual([])
  })

  it('DATA-LOSS (crítico): reducir comidas conserva la sobrante CON logs y borra la SIN logs', () => {
    // Plan de 3 comidas; el coach lo recorta a 1. m1 tiene adherencia registrada, m2 no.
    const { existingMeals, templateMeals, removalCandidates } = buildMealReconcileInput(
      [
        { id: 'm0', order_index: 0 },
        { id: 'm1-logged', order_index: 1 },
        { id: 'm2-empty', order_index: 2 },
      ],
      [draft('solo desayuno')]
    )
    expect(removalCandidates.sort()).toEqual(['m1-logged', 'm2-empty'])
    // reconcileMeals (fn compartida) recibe qué comidas tienen logs y decide
    const loggedMealIds = new Set(['m1-logged'])
    const { toDelete, preservedWithLogs } = reconcileMeals(existingMeals, templateMeals, loggedMealIds)
    expect(toDelete).toEqual(['m2-empty']) // huérfana sin logs -> se borra
    expect(preservedWithLogs).toEqual(['m1-logged']) // con historial -> se conserva
  })

  it('mapeo estilo propagateTemplate (order_index = posición): sobrante con logs se conserva', () => {
    // oldMeals emparejadas por posición; el plan tenía 2 comidas y la plantilla queda en 1.
    const { existingMeals, templateMeals, removalCandidates } = buildMealReconcileInput(
      [{ id: 'pos0', order_index: 0 }, { id: 'pos1-logged', order_index: 1 }],
      [draft('única comida')]
    )
    expect(removalCandidates).toEqual(['pos1-logged'])
    const { toDelete, preservedWithLogs } = reconcileMeals(existingMeals, templateMeals, new Set(['pos1-logged']))
    expect(toDelete).toEqual([])
    expect(preservedWithLogs).toEqual(['pos1-logged'])
  })
})
