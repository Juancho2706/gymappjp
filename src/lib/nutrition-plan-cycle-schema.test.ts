import { describe, expect, it } from 'vitest'
import { nutritionPlanCycleUpsertSchema } from './nutrition-plan-cycle-schema'

describe('nutritionPlanCycleUpsertSchema', () => {
  it('accepts valid payload', () => {
    const r = nutritionPlanCycleUpsertSchema.safeParse({
      name: 'Bulk',
      start_date: '2026-04-01',
      is_active: true,
      blocks: [
        {
          week_start: 1,
          week_end: 4,
          template_id: '123e4567-e89b-12d3-a456-426614174000',
          label: 'Masa',
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rejects week_end before week_start', () => {
    const r = nutritionPlanCycleUpsertSchema.safeParse({
      name: 'X',
      start_date: '2026-04-01',
      is_active: true,
      blocks: [
        {
          week_start: 3,
          week_end: 1,
          template_id: '123e4567-e89b-12d3-a456-426614174000',
          label: 'Bad',
        },
      ],
    })
    expect(r.success).toBe(false)
  })
})
