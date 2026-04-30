import { describe, expect, it } from 'vitest'
import { resolveNutritionCycleBlockForDate } from './nutrition-plan-cycle-resolver'

describe('resolveNutritionCycleBlockForDate', () => {
  const blocks = [
    { week_start: 1, week_end: 2, template_id: '00000000-0000-4000-8000-000000000001', label: 'A' },
    { week_start: 3, week_end: 4, template_id: '00000000-0000-4000-8000-000000000002', label: 'B' },
  ]

  it('returns null before start', () => {
    const r = resolveNutritionCycleBlockForDate('2026-01-05', blocks, '2026-01-01')
    expect(r.weekIndex).toBe(0)
    expect(r.block).toBeNull()
  })

  it('maps first block in week 1', () => {
    const r = resolveNutritionCycleBlockForDate('2026-01-05', blocks, '2026-01-05')
    expect(r.weekIndex).toBe(1)
    expect(r.block?.label).toBe('A')
  })

  it('maps second block at calendar week offset 3', () => {
    const r = resolveNutritionCycleBlockForDate('2026-01-05', blocks, '2026-01-19')
    expect(r.weekIndex).toBe(3)
    expect(r.block?.label).toBe('B')
  })

  it('returns null when week falls outside defined blocks', () => {
    const r = resolveNutritionCycleBlockForDate('2026-01-05', blocks, '2026-03-30')
    expect(r.weekIndex).toBeGreaterThan(4)
    expect(r.block).toBeNull()
  })
})
