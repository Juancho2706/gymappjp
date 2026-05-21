// Schemas movidos a packages/schemas/nutrition.ts
// Este archivo se mantiene como re-export para backward compatibility.
export {
  FoodItemSchema,
  MealSchema,
  TemplateUpsertSchema,
  ClientPlanSchema,
  CustomFoodSchema,
} from '@eva/schemas'
export type {
  FoodItemInput,
  MealInput,
  TemplateUpsertInput,
  ClientPlanInput,
  CustomFoodInput,
} from '@eva/schemas'
