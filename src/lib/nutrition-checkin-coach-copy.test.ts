import { describe, expect, it } from 'vitest'
import { coachCheckinNutritionCaution } from './nutrition-checkin-coach-copy'

describe('coachCheckinNutritionCaution', () => {
  it('returns null without two weights', () => {
    expect(coachCheckinNutritionCaution([80], 20)).toBeNull()
  })

  it('returns null when weight stable', () => {
    expect(coachCheckinNutritionCaution([80, 79.5], 20)).toBeNull()
  })

  it('returns null when adherence ok', () => {
    expect(coachCheckinNutritionCaution([78, 82], 50)).toBeNull()
  })

  it('flags sharp loss with low adherence', () => {
    const msg = coachCheckinNutritionCaution([76, 82], 30)
    expect(msg).toContain('peso')
  })
})
