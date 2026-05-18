import { afterEach, describe, expect, it } from 'vitest'
import {
  enqueueNutritionOfflineToggle,
  isLikelyOfflineError,
  NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY,
  readNutritionOfflineToggleQueue,
  writeNutritionOfflineToggleQueue,
  type NutritionOfflineToggleItem,
} from './nutrition-offline-queue'

const sample: NutritionOfflineToggleItem = {
  userId: 'u1',
  planId: 'p1',
  mealId: 'm1',
  completed: true,
  coachSlug: 'coach',
  date: '2026-04-29',
}

describe('nutrition-offline-queue', () => {
  afterEach(() => {
    localStorage.removeItem(NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY)
  })

  it('dedupes by mealId + date (last write wins)', () => {
    enqueueNutritionOfflineToggle(sample)
    enqueueNutritionOfflineToggle({ ...sample, completed: false })
    const q = readNutritionOfflineToggleQueue()
    expect(q).toHaveLength(1)
    expect(q[0]?.completed).toBe(false)
  })

  it('keeps distinct meals on same date', () => {
    enqueueNutritionOfflineToggle(sample)
    enqueueNutritionOfflineToggle({ ...sample, mealId: 'm2', completed: true })
    expect(readNutritionOfflineToggleQueue()).toHaveLength(2)
  })

  it('detects typical network errors', () => {
    expect(isLikelyOfflineError(new Error('Failed to fetch'))).toBe(true)
    expect(isLikelyOfflineError(new Error('NetworkError when'))).toBe(true)
    expect(isLikelyOfflineError(new Error('Something else'))).toBe(false)
  })

  it('treats navigator.onLine false as offline error', () => {
    const orig = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(isLikelyOfflineError(new Error('bad'))).toBe(true)
    Object.defineProperty(navigator, 'onLine', { value: orig, configurable: true })
  })

  it('write then read roundtrip', () => {
    writeNutritionOfflineToggleQueue([sample])
    expect(readNutritionOfflineToggleQueue()).toEqual([sample])
  })
})
