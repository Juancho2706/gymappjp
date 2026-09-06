import { describe, expect, it } from 'vitest'
import type { BuilderFood } from '@eva/nutrition-v2'
import { buildItemInsertRow, type DraftPrescriptionItem } from './plan-draft-rows'

/**
 * W3.1 «Cantidades honestas» — la ÚLTIMA MILLA del LINAJE (SPEC §6.1).
 *
 * El `id` de cada fila sigue siendo NUEVO en cada publicación (`plan-persistence.ts:489`): eso no
 * cambia. Lo que cambia es que la fila ahora declara de QUIÉN es copia, y con eso la lectura
 * (`get_nutrition_today_v2`) puede reasignar al ítem vigente los registros que el alumno ya hizo
 * hoy — en vez de dejarlos huérfanos y borrarle el «Registrado».
 *
 * La validación real (mismo plan, ≠ id) la hace `persist_and_publish_nutrition_plan_v2` y NUNCA
 * falla la publicación: acá solo se cuida que la columna viaje.
 */

const FOOD_ID = '11111111-1111-4111-8111-111111111111'
const ANCESTRO = '22222222-2222-4222-8222-222222222222'

const POLLO: BuilderFood = {
  id: FOOD_ID,
  name: 'Pollo',
  brand: null,
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatsG: 3.6,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  householdGrams: null,
  householdLabel: null,
}

function item(over: Partial<DraftPrescriptionItem> = {}): DraftPrescriptionItem {
  return {
    foodId: FOOD_ID,
    recipeId: null,
    customName: null,
    quantity: 100,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    orderIndex: 0,
    householdLabel: null,
    householdGrams: null,
    sourceItemId: null,
    ...over,
  }
}

function row(over: Partial<DraftPrescriptionItem> = {}) {
  return buildItemInsertRow({
    versionId: 'v1',
    mealSlotId: 's1',
    orderIndex: 0,
    item: item(over),
    food: POLLO,
  })
}

describe('buildItemInsertRow — linaje del ítem', () => {
  it('un ítem con ancestro escribe `source_item_id`', () => {
    expect(row({ sourceItemId: ANCESTRO }).source_item_id).toBe(ANCESTRO)
  })

  it('un ítem sin ancestro escribe null (alta nueva, copia o ítem modificado)', () => {
    expect(row().source_item_id).toBeNull()
  })

  it('el `id` de la fila sigue siendo el que manda el llamador: el linaje NO lo reemplaza', () => {
    const built = buildItemInsertRow({
      versionId: 'v1',
      mealSlotId: 's1',
      orderIndex: 0,
      item: item({ sourceItemId: ANCESTRO }),
      food: POLLO,
      id: '33333333-3333-4333-8333-333333333333',
    })
    expect(built.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(built.source_item_id).toBe(ANCESTRO)
    // Nunca se escriben iguales desde acá: el CHECK `source_item_id is distinct from id` de la
    // tabla lo prohíbe, y el RPC además lo baja a NULL si llegaran a coincidir.
    expect(built.id).not.toBe(built.source_item_id)
  })
})
