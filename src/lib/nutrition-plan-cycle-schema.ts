import { z } from 'zod'

export const nutritionCycleBlockSchema = z
  .object({
    week_start: z.number().int().min(1).max(104),
    week_end: z.number().int().min(1).max(104),
    template_id: z.string().uuid('Plantilla inválida'),
    label: z.string().min(1, 'Etiqueta requerida').max(120),
  })
  .refine((b) => b.week_end >= b.week_start, {
    message: 'week_end debe ser mayor o igual que week_start',
    path: ['week_end'],
  })

export const nutritionPlanCycleUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  blocks: z.array(nutritionCycleBlockSchema).min(1).max(24),
  is_active: z.boolean(),
})

export type NutritionPlanCycleUpsertInput = z.infer<typeof nutritionPlanCycleUpsertSchema>
