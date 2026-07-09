import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_KEYPAD_STEP, KEYPAD_STEP_KEY } from '@eva/workout-engine'
import { readKeypadStep, writeKeypadStep } from './keypad-step'

describe('readKeypadStep / writeKeypadStep', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('defaults to 2.5 when unset', () => {
    expect(readKeypadStep()).toBe(DEFAULT_KEYPAD_STEP)
  })
  it('round-trips a valid preset', () => {
    writeKeypadStep(1.25)
    expect(localStorage.getItem(KEYPAD_STEP_KEY)).toBe('1.25')
    expect(readKeypadStep()).toBe(1.25)
  })
  it('ignores an invalid preset on write and read', () => {
    writeKeypadStep(3.3)
    expect(localStorage.getItem(KEYPAD_STEP_KEY)).toBeNull()
    localStorage.setItem(KEYPAD_STEP_KEY, '999')
    expect(readKeypadStep()).toBe(DEFAULT_KEYPAD_STEP)
  })
})
