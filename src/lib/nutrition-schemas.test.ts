import { describe, expect, it } from 'vitest'
import {
  ClientPlanSchema,
  CustomFoodSchema,
  TemplateUpsertSchema,
} from './nutrition-schemas'

describe('nutrition-schemas', () => {
  it('accepts valid template payload', () => {
    const result = TemplateUpsertSchema.safeParse({
      name: 'Definicion base',
      daily_calories: 1900,
      protein_g: 150,
      carbs_g: 180,
      fats_g: 60,
      instructions: 'Mantener hidratacion',
      meals: [
        {
          name: 'Desayuno',
          order_index: 0,
          day_of_week: 3,
          foodItems: [{ food_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 2, unit: 'un' }],
        },
      ],
      propagateClientIds: ['550e8400-e29b-41d4-a716-446655440001'],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.meals[0]?.day_of_week).toBe(3)
    }
  })

  it('rejects meals without food items in client plan', () => {
    const result = ClientPlanSchema.safeParse({
      name: 'Plan cliente',
      daily_calories: 1700,
      protein_g: 130,
      carbs_g: 150,
      fats_g: 55,
      meals: [{ name: 'Almuerzo', order_index: 0, foodItems: [] }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/al menos 1 alimento/i)
    }
  })

  it('normalizes missing unit to grams in food item schema', () => {
    const result = TemplateUpsertSchema.safeParse({
      name: 'Plan con unidad por defecto',
      daily_calories: 1800,
      protein_g: 140,
      carbs_g: 170,
      fats_g: 58,
      meals: [
        {
          name: 'Cena',
          order_index: 0,
          foodItems: [{ food_id: '550e8400-e29b-41d4-a716-446655440002', quantity: 100 }],
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.meals[0]?.foodItems[0]?.unit).toBe('g')
    }
  })

  it('accepts meal-level swap options in food items', () => {
    const result = TemplateUpsertSchema.safeParse({
      name: 'Plan con swaps',
      daily_calories: 2000,
      protein_g: 150,
      carbs_g: 210,
      fats_g: 65,
      meals: [
        {
          name: 'Almuerzo',
          order_index: 0,
          foodItems: [
            {
              food_id: '550e8400-e29b-41d4-a716-446655440002',
              quantity: 100,
              unit: 'g',
              swap_options: [
                {
                  food_id: '550e8400-e29b-41d4-a716-446655440003',
                  is_liquid: false,
                  quantity: 180,
                  unit: 'g',
                  name: 'Papas cocidas',
                  calories: 87,
                  protein_g: 1.9,
                  carbs_g: 20.1,
                  fats_g: 0.1,
                  serving_size: 100,
                  serving_unit: 'g',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.meals[0]?.foodItems[0]?.swap_options?.[0]?.quantity).toBe(180)
      expect(result.data.meals[0]?.foodItems[0]?.swap_options?.[0]?.unit).toBe('g')
    }
  })

  it('rejects invalid custom food unit', () => {
    const result = CustomFoodSchema.safeParse({
      name: 'Yogurt',
      calories: 90,
      protein_g: 8,
      carbs_g: 10,
      fats_g: 1,
      serving_size: 125,
      serving_unit: 'ml',
      category: 'lacteo',
    })

    expect(result.success).toBe(false)
  })
})
