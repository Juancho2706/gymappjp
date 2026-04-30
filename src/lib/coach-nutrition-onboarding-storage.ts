const prefix = 'eva_coach_nutrition_onboarding_dismissed_v1'

export function coachNutritionOnboardingStorageKey(coachId: string): string {
  return `${prefix}_${coachId}`
}

export function readCoachNutritionOnboardingDismissed(coachId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(coachNutritionOnboardingStorageKey(coachId)) === '1'
  } catch {
    return false
  }
}

export function writeCoachNutritionOnboardingDismissed(coachId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(coachNutritionOnboardingStorageKey(coachId), '1')
  } catch {
    /* quota / private mode */
  }
}

export function clearCoachNutritionOnboardingDismissed(coachId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(coachNutritionOnboardingStorageKey(coachId))
  } catch {
    /* ignore */
  }
}
