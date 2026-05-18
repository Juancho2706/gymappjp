import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('featureFlags', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('nutritionAnalytics is true when NEXT_PUBLIC_FF_NUTRITION_ANALYTICS is unset', async () => {
    vi.unstubAllEnvs()
    const { featureFlags } = await import('./feature-flags')
    expect(featureFlags.nutritionAnalytics).toBe(true)
  })

  it('nutritionAnalytics is false when env is false', async () => {
    vi.stubEnv('NEXT_PUBLIC_FF_NUTRITION_ANALYTICS', 'false')
    vi.resetModules()
    const { featureFlags } = await import('./feature-flags')
    expect(featureFlags.nutritionAnalytics).toBe(false)
  })

  it('nutritionWeeklyPlan is true only when env is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FF_WEEKLY_PLAN', 'true')
    vi.resetModules()
    const { featureFlags } = await import('./feature-flags')
    expect(featureFlags.nutritionWeeklyPlan).toBe(true)
  })
})
