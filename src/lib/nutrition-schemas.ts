import { z } from 'zod'

// 'ml' sigue siendo válido en el UI para alimentos líquidos (FoodSearchDrawer).
// La migración 20260413 normalizó datos en DB pero el código aún emite 'ml'.
// null/undefined se normaliza a 'g' vía preprocess.
const unitSchema = z.preprocess(
  (v) => v ?? 'g',
  z.enum(['g', 'un', 'ml'])
)

export const FoodItemSchema = z.object({
  food_id: z.string().uuid('ID de alimento inválido'),
  quantity: z
    .number({ error: 'La cantidad debe ser un número' })
    .positive('La cantidad debe ser mayor a 0')
    .max(5000, 'Cantidad máxima: 5000'),
  unit: unitSchema,
})

export const MealSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre de la comida es requerido')
    .max(100, 'Máximo 100 caracteres'),
  order_index: z.number().int().nonnegative(),
  foodItems: z
    .array(FoodItemSchema)
    .min(1, 'Cada comida debe tener al menos 1 alimento')
    .max(20, 'Máximo 20 alimentos por comida'),
})

// Mínimo 0 kcal: coaches pueden guardar borradores con metas sin definir.
// Validación de "tiene sentido nutricional" queda en la UI (warnings visuales).
export const TemplateUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'Máximo 120 caracteres'),
  daily_calories: z.number().int().min(0).max(15000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000),
  fats_g: z.number().min(0).max(1000),
  instructions: z.string().max(2000).nullish(),
  goal_type: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  is_favorite: z.boolean().nullish(),
  meals: z
    .array(MealSchema)
    .min(1, 'El plan debe tener al menos 1 comida')
    .max(10, 'Máximo 10 comidas'),
  propagateClientIds: z.array(z.string().uuid()).optional(),
})

export const ClientPlanSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, 'El nombre del plan es requerido')
    .max(120, 'Máximo 120 caracteres'),
  daily_calories: z.number().int().min(0).max(15000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000),
  fats_g: z.number().min(0).max(1000),
  instructions: z.string().max(2000).nullish(),
  meals: z
    .array(MealSchema)
    .min(1, 'El plan debe tener al menos 1 comida')
    .max(10, 'Máximo 10 comidas'),
})

const VALID_FOOD_CATEGORIES = [
  'proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta',
  'verdura', 'legumbre', 'bebida', 'snack', 'otro',
] as const

export const CustomFoodSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'Máximo 120 caracteres'),
  calories: z.number().int().min(0, 'Las calorías no pueden ser negativas').max(9000, 'Máximo 9000 kcal'),
  protein_g: z.number().min(0).max(500),
  carbs_g: z.number().min(0).max(500),
  fats_g: z.number().min(0).max(500),
  serving_size: z
    .number()
    .positive('El tamaño de porción debe ser mayor a 0')
    .max(10000),
  serving_unit: z.enum(['g', 'un']),
  category: z.enum(VALID_FOOD_CATEGORIES),
})

export type FoodItemInput = z.infer<typeof FoodItemSchema>
export type MealInput = z.infer<typeof MealSchema>
export type TemplateUpsertInput = z.infer<typeof TemplateUpsertSchema>
export type ClientPlanInput = z.infer<typeof ClientPlanSchema>
export type CustomFoodInput = z.infer<typeof CustomFoodSchema>
