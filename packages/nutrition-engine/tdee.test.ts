import { describe, it, expect } from 'vitest'
import {
  computeMifflinStJeor,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
  ACTIVITY_FACTORS,
  KCAL_PER_GRAM,
} from './tdee'

describe('computeMifflinStJeor', () => {
  it('male 80kg/180cm/30y → 1780 (10·80+6.25·180−5·30+5)', () => {
    expect(
      computeMifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })
    ).toBe(1780)
  })

  it('female 60kg/165cm/28y → 1330 (600+1031.25−140−161=1330.25)', () => {
    expect(
      computeMifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, age: 28 })
    ).toBe(1330)
  })

  it('female 70kg/175cm/40y → 1438 (700+1093.75−200−161=1432.75)', () => {
    expect(
      computeMifflinStJeor({ sex: 'female', weightKg: 70, heightCm: 175, age: 40 })
    ).toBe(1433)
  })

  it('sex changes BMR by exactly 166 kcal (male +5 vs female −161)', () => {
    const args = { weightKg: 75, heightCm: 178, age: 35 } as const
    const m = computeMifflinStJeor({ sex: 'male', ...args })
    const f = computeMifflinStJeor({ sex: 'female', ...args })
    expect(m - f).toBe(166)
  })
})

describe('computeTDEE', () => {
  it('1780 BMR · 1.55 (moderate) → 2759', () => {
    expect(computeTDEE(1780, 1.55)).toBe(2759)
  })

  it('accepts a named ActivityLevel', () => {
    expect(computeTDEE(1780, 'moderate')).toBe(
      Math.round(1780 * ACTIVITY_FACTORS.moderate)
    )
  })

  it('sedentary 1330 · 1.2 → 1596', () => {
    expect(computeTDEE(1330, 'sedentary')).toBe(1596)
  })
})

describe('deriveCalorieTarget', () => {
  const tdee = 2760
  it('lose → 15% deficit (·0.85) → 2346', () => {
    expect(deriveCalorieTarget(tdee, 'lose')).toBe(2346)
  })
  it('maintain → unchanged → 2760', () => {
    expect(deriveCalorieTarget(tdee, 'maintain')).toBe(2760)
  })
  it('gain → 10% surplus (·1.1) → 3036', () => {
    expect(deriveCalorieTarget(tdee, 'gain')).toBe(3036)
  })
})

describe('deriveMacroTargets', () => {
  it('lose: 2000kcal / 80kg → P176 (2.2g/kg), F67 (30%), C remainder', () => {
    const m = deriveMacroTargets(2000, 80, 'lose')
    // protein 2.2·80 = 176 g
    expect(m.protein_g).toBe(176)
    // fat 30% of 2000 = 600 kcal / 9 = 66.67 → 67 g
    expect(m.fats_g).toBe(67)
    // carbs remainder: (2000 − 176·4 − 67·9)/4 = (2000−704−603)/4 = 173.25 → 173
    expect(m.carbs_g).toBe(173)
  })

  it('maintain: 2500kcal / 75kg → P135 (1.8g/kg), F76 (27.5%), C remainder', () => {
    const m = deriveMacroTargets(2500, 75, 'maintain')
    expect(m.protein_g).toBe(135) // 1.8·75
    // fat 27.5% of 2500 = 687.5 / 9 = 76.39 → 76
    expect(m.fats_g).toBe(76)
    // carbs (2500 − 540 − 684)/4 = 1276/4 = 319
    expect(m.carbs_g).toBe(319)
  })

  it('gain: 3000kcal / 90kg → P144 (1.6g/kg), F83 (25%), C remainder', () => {
    const m = deriveMacroTargets(3000, 90, 'gain')
    expect(m.protein_g).toBe(144) // 1.6·90
    // fat 25% of 3000 = 750 / 9 = 83.33 → 83
    expect(m.fats_g).toBe(83)
    // carbs (3000 − 576 − 747)/4 = 1677/4 = 419.25 → 419
    expect(m.carbs_g).toBe(419)
  })

  it('never returns negative carbs when protein+fat exceed calories', () => {
    const m = deriveMacroTargets(1000, 120, 'lose')
    expect(m.carbs_g).toBe(0)
    expect(m.protein_g).toBeGreaterThan(0)
  })

  it('macro kcal sum stays within rounding tolerance of target', () => {
    const calories = 2400
    const m = deriveMacroTargets(calories, 80, 'maintain')
    const sum =
      m.protein_g * KCAL_PER_GRAM.protein +
      m.carbs_g * KCAL_PER_GRAM.carbs +
      m.fats_g * KCAL_PER_GRAM.fats
    expect(Math.abs(sum - calories)).toBeLessThanOrEqual(10)
  })
})
