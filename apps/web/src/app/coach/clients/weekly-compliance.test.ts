import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/date-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/date-utils')>()
  return {
    ...actual,
    getTodayInSantiago: vi.fn(() => ({
      iso: '2026-04-28',
      date: new Date(2026, 3, 28),
      dayOfWeek: 2,
    })),
  }
})

import { getWeeklyCompliance } from './[clientId]/actions'

describe('getWeeklyCompliance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes nutrition compliance from daily_nutrition_logs meal marks', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'workout_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ data: [{ id: 'ws1' }, { id: 'ws2' }] }),
          }
        }
        if (table === 'nutrition_plans') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'plan-1',
                nutrition_meals: [
                  { id: 'm1', day_of_week: null },
                  { id: 'm2', day_of_week: null },
                  { id: 'm3', day_of_week: null },
                ],
              },
            }),
          }
        }
        if (table === 'daily_nutrition_logs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({
              data: [
                {
                  log_date: '2026-04-27',
                  nutrition_meal_logs: [
                    { meal_id: 'm1', is_completed: true },
                    { meal_id: 'm2', is_completed: false },
                  ],
                },
                {
                  log_date: '2026-04-28',
                  nutrition_meal_logs: [{ meal_id: 'm3', is_completed: true }],
                },
              ],
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    createClientMock.mockResolvedValue(supabase)

    const result = await getWeeklyCompliance('client-1')
    expect(result.workoutCompliance).toBe(50)
    // 7 días × 3 comidas/día = 21 ; completadas aplicables = 2 => ~10%
    expect(result.nutritionCompliance).toBe(10)
    expect(result.nutritionMealLogs).toHaveLength(3)
    expect(result.mealCompletions).toHaveLength(3)
  })
})
