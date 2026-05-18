import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCoachNutritionOnboardingDismissed,
  coachNutritionOnboardingStorageKey,
  readCoachNutritionOnboardingDismissed,
  writeCoachNutritionOnboardingDismissed,
} from './coach-nutrition-onboarding-storage'

describe('coach-nutrition-onboarding-storage', () => {
  const coachId = 'test-coach-id'

  afterEach(() => {
    localStorage.removeItem(coachNutritionOnboardingStorageKey(coachId))
  })

  it('roundtrips dismissed flag', () => {
    expect(readCoachNutritionOnboardingDismissed(coachId)).toBe(false)
    writeCoachNutritionOnboardingDismissed(coachId)
    expect(readCoachNutritionOnboardingDismissed(coachId)).toBe(true)
    clearCoachNutritionOnboardingDismissed(coachId)
    expect(readCoachNutritionOnboardingDismissed(coachId)).toBe(false)
  })
})
