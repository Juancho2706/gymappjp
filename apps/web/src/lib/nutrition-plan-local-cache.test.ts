import { afterEach, describe, expect, it } from 'vitest'
import {
  nutritionPlanCacheKey,
  readNutritionLastViewed,
  readNutritionReadModelCache,
  tryLoadNutritionRecoveryBundle,
  writeNutritionLastViewed,
  writeNutritionReadModelCache,
} from './nutrition-plan-local-cache'

describe('nutrition-plan-local-cache', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('roundtrips read model with dailyLog and clientUserId', () => {
    writeNutritionReadModelCache('coach-a', {
      plan: { id: 'p1', name: 'Test' } as { id: string },
      today: '2026-04-29',
      adherence: [{ log_date: '2026-04-29' }],
      clientUserId: 'user-1',
      dailyLog: { id: 'log-1', nutrition_meal_logs: [] },
    })
    expect(localStorage.getItem(nutritionPlanCacheKey('coach-a', 'p1'))).toBeTruthy()
    expect(readNutritionLastViewed('coach-a')).toEqual({ planId: 'p1', userId: 'user-1' })
    const got = readNutritionReadModelCache('coach-a', 'p1')
    expect(got?.v).toBe(1)
    expect(got?.today).toBe('2026-04-29')
    expect(got?.clientUserId).toBe('user-1')
    expect((got?.plan as { name: string }).name).toBe('Test')
    expect((got?.dailyLog as { id: string }).id).toBe('log-1')
  })

  it('returns null for missing key', () => {
    expect(readNutritionReadModelCache('x', 'y')).toBeNull()
  })

  it('tryLoadNutritionRecoveryBundle requires matching user and clientUserId in cache', () => {
    writeNutritionReadModelCache('slug', {
      plan: { id: 'p9' } as { id: string },
      today: '2026-04-29',
      adherence: [],
      clientUserId: 'u1',
    })
    expect(tryLoadNutritionRecoveryBundle('slug', 'u1')).not.toBeNull()
    expect(tryLoadNutritionRecoveryBundle('slug', 'u2')).toBeNull()
  })

  it('tryLoadNutritionRecoveryBundle returns null without last viewed', () => {
    localStorage.setItem(
      nutritionPlanCacheKey('slug', 'p1'),
      JSON.stringify({
        v: 1,
        cachedAt: 'x',
        today: '2026-04-29',
        clientUserId: 'u1',
        plan: { id: 'p1' },
        adherence: [],
      })
    )
    expect(tryLoadNutritionRecoveryBundle('slug', 'u1')).toBeNull()
  })

  it('writeNutritionLastViewed roundtrips', () => {
    writeNutritionLastViewed('c', { planId: 'p2', userId: 'u2' })
    expect(readNutritionLastViewed('c')).toEqual({ planId: 'p2', userId: 'u2' })
  })
})
