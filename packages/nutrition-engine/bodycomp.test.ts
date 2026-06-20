import { describe, it, expect } from 'vitest'
import {
  computeKatchMcArdle,
  computeCunningham,
  leanBodyMassFromBodyFat,
} from './bodycomp'

describe('computeKatchMcArdle', () => {
  it('70kg LBM → 1882 (370 + 21.6·70 = 1882)', () => {
    expect(computeKatchMcArdle(70)).toBe(1882)
  })

  it('rounds: 64.5kg LBM → 1763 (370 + 21.6·64.5 = 1763.2)', () => {
    expect(computeKatchMcArdle(64.5)).toBe(1763)
  })

  it('LBM 0 → 370 (base term only)', () => {
    expect(computeKatchMcArdle(0)).toBe(370)
  })

  it('clamps negative LBM to 0 → 370', () => {
    expect(computeKatchMcArdle(-10)).toBe(370)
  })
})

describe('computeCunningham', () => {
  it('70kg LBM → 2040 (500 + 22·70 = 2040)', () => {
    expect(computeCunningham(70)).toBe(2040)
  })

  it('rounds: 64.5kg LBM → 1919 (500 + 22·64.5 = 1919)', () => {
    expect(computeCunningham(64.5)).toBe(1919)
  })

  it('estimates higher than Katch-McArdle for the same LBM', () => {
    expect(computeCunningham(70)).toBeGreaterThan(computeKatchMcArdle(70))
  })

  it('LBM 0 → 500 (base term only)', () => {
    expect(computeCunningham(0)).toBe(500)
  })
})

describe('leanBodyMassFromBodyFat', () => {
  it('80kg @ 20% bf → 64kg LBM', () => {
    expect(leanBodyMassFromBodyFat(80, 20)).toBe(64)
  })

  it('70kg @ 15% bf → 59.5kg LBM (not rounded)', () => {
    expect(leanBodyMassFromBodyFat(70, 15)).toBeCloseTo(59.5, 5)
  })

  it('0% bf → LBM equals weight', () => {
    expect(leanBodyMassFromBodyFat(75, 0)).toBe(75)
  })

  it('clamps bodyFat > 100 to 100 → LBM 0', () => {
    expect(leanBodyMassFromBodyFat(80, 150)).toBe(0)
  })

  it('clamps negative bodyFat to 0 → LBM equals weight', () => {
    expect(leanBodyMassFromBodyFat(80, -5)).toBe(80)
  })

  it('chains into Katch-McArdle: 80kg @ 20% → LBM 64 → 1752 kcal', () => {
    const lbm = leanBodyMassFromBodyFat(80, 20)
    expect(computeKatchMcArdle(lbm)).toBe(1752) // 370 + 21.6·64 = 1752.4 → 1752
  })
})
