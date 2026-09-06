import { describe, expect, it } from 'vitest'
import type { BuilderFood } from '@eva/nutrition-v2'
import {
  HOUSEHOLD_GRAMS_ERROR,
  buildItemInsertRow,
  type DraftPrescriptionItem,
} from './plan-draft-rows'

/**
 * W2 «Cantidades honestas» — la ÚLTIMA MILLA (b18 de la auditoría W2.0).
 *
 * «Gramos como verdad, medida casera como interfaz» (SPEC §5.1): la unidad `casera` vive en el
 * editor y en el borrador, y muere acá. La fila que se escribe lleva g/ml y la medida congelada
 * en sus dos columnas; el CHECK `unit <> 'casera'` de la tabla es el cierre real de esa regla.
 */

const FOOD_ID = '11111111-1111-4111-8111-111111111111'

/** Huevo per-100 con medida casera «huevo» = 61 g. */
const HUEVO: BuilderFood = {
  id: FOOD_ID,
  name: 'Huevo',
  brand: null,
  calories: 149,
  proteinG: 10,
  carbsG: 1.6,
  fatsG: 11,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  householdGrams: 61,
  householdLabel: 'huevo',
}

function item(over: Partial<DraftPrescriptionItem> = {}): DraftPrescriptionItem {
  return {
    foodId: FOOD_ID,
    recipeId: null,
    customName: null,
    quantity: 2,
    unit: 'casera',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    orderIndex: 0,
    householdLabel: 'huevo',
    householdGrams: 61,
    sourceItemId: null,
    ...over,
  }
}

function row(over: Partial<DraftPrescriptionItem> = {}, food: BuilderFood | null = HUEVO) {
  return buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item: item(over), food })
}

describe('buildItemInsertRow — traducción de la medida casera', () => {
  it('«2 huevos» se persiste como 122 g con el par congelado (jamás `unit = casera`)', () => {
    const r = row()
    expect(r.quantity).toBe(122)
    expect(r.unit).toBe('g')
    expect(r.household_label).toBe('huevo')
    expect(r.household_grams).toBe(61)
  })

  it('los macros congelados son los MISMOS por los dos caminos (casera y gramos)', () => {
    const casera = row()
    const gramos = row({ unit: 'g', quantity: 122, householdLabel: null, householdGrams: null })
    expect(casera.snapshot_calories).toBe(gramos.snapshot_calories)
    expect(casera.snapshot_protein_g).toBe(gramos.snapshot_protein_g)
    expect(casera.snapshot_carbs_g).toBe(gramos.snapshot_carbs_g)
    expect(casera.snapshot_fats_g).toBe(gramos.snapshot_fats_g)
    expect(casera.snapshot_calories).toBeCloseTo(181.8, 1)
  })

  it('un líquido se persiste en ml, no en gramos', () => {
    const jugo: BuilderFood = { ...HUEVO, servingUnit: 'ml', householdGrams: 240, householdLabel: 'taza' }
    const r = buildItemInsertRow({
      versionId: 'v1',
      mealSlotId: 's1',
      orderIndex: 0,
      item: item({ quantity: 1, householdLabel: 'taza', householdGrams: 240 }),
      food: jugo,
    })
    expect(r.unit).toBe('ml')
    expect(r.quantity).toBe(240)
  })

  it('un ítem NO casero escribe el par en null aunque el alimento tenga medida', () => {
    // La medida se congela SOLO cuando el coach la eligió: tenerla en el catálogo no alcanza.
    const r = row({ unit: 'g', quantity: 200 })
    expect(r.unit).toBe('g')
    expect(r.quantity).toBe(200)
    expect(r.household_label).toBeNull()
    expect(r.household_grams).toBeNull()
  })

  it('cae al par del ALIMENTO cuando el borrador no lo trae (cliente viejo, R2)', () => {
    const r = row({ householdLabel: null, householdGrams: null })
    expect(r.quantity).toBe(122)
    expect(r.household_grams).toBe(61)
  })

  it('tira con un código claro si la medida casera no es utilizable (R13)', () => {
    // Sin gramaje en ningún lado.
    expect(() => row({ householdLabel: null, householdGrams: null }, { ...HUEVO, householdGrams: null })).toThrow(
      HOUSEHOLD_GRAMS_ERROR,
    )
    // Fuera del rango del CHECK [1, 1000]: el INSERT reventaría con un 23514 anónimo.
    expect(() => row({ householdGrams: 5000 })).toThrow(HOUSEHOLD_GRAMS_ERROR)
    expect(() => row({ householdGrams: 0.5 })).toThrow(HOUSEHOLD_GRAMS_ERROR)
    // Etiqueta vacía: media medida no rotula nada.
    expect(() => row({ householdLabel: '  ' }, { ...HUEVO, householdLabel: null })).toThrow(HOUSEHOLD_GRAMS_ERROR)
  })

  it('un ítem libre (sin alimento) en gramos sigue escribiéndose como siempre', () => {
    const r = row({ foodId: null, customName: 'Colación libre', unit: 'g', quantity: 150 }, null)
    expect(r.quantity).toBe(150)
    expect(r.unit).toBe('g')
    expect(r.snapshot_name).toBe('Colación libre')
    expect(r.snapshot_calories).toBeNull()
    expect(r.household_label).toBeNull()
  })
})
