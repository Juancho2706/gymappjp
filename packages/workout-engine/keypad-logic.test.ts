import { describe, it, expect, beforeEach } from 'vitest'
import {
  incrementChipsForStep,
  parseWeightEsCl,
  formatWeightEsCl,
  applyKeypadIncrement,
  appendKeypadDigit,
  appendKeypadDecimal,
  keypadBackspace,
} from './keypad-logic'

const WEIGHT = { allowDecimal: true } as const
const REPS = { allowDecimal: false } as const

describe('incrementChipsForStep', () => {
  it('default step 2.5 → chips -2.5 / +2.5 / +5', () => {
    expect(incrementChipsForStep(2.5)).toEqual([-2.5, 2.5, 5])
  })
  it('step 0.5 → -0.5 / +0.5 / +1', () => {
    expect(incrementChipsForStep(0.5)).toEqual([-0.5, 0.5, 1])
  })
  it('step 5 → -5 / +5 / +10', () => {
    expect(incrementChipsForStep(5)).toEqual([-5, 5, 10])
  })
})

describe('parseWeightEsCl', () => {
  it('parses comma decimal (es-CL)', () => {
    expect(parseWeightEsCl('22,5')).toBe(22.5)
  })
  it('parses dot decimal (initial numeric defaultValue)', () => {
    expect(parseWeightEsCl('72.5')).toBe(72.5)
  })
  it('returns null for empty / partial / garbage', () => {
    expect(parseWeightEsCl('')).toBeNull()
    expect(parseWeightEsCl(',')).toBeNull()
    expect(parseWeightEsCl('-')).toBeNull()
    expect(parseWeightEsCl('abc')).toBeNull()
    expect(parseWeightEsCl(null)).toBeNull()
  })
})

describe('formatWeightEsCl', () => {
  it('uses comma and trims trailing zeros', () => {
    expect(formatWeightEsCl(22.5)).toBe('22,5')
    expect(formatWeightEsCl(60)).toBe('60')
    expect(formatWeightEsCl(1.25)).toBe('1,25')
  })
  it('kills floating-point noise', () => {
    expect(formatWeightEsCl(0.1 + 0.2)).toBe('0,3')
  })
})

describe('applyKeypadIncrement', () => {
  it('adds and subtracts using comma format', () => {
    expect(applyKeypadIncrement('20', 2.5)).toBe('22,5')
    expect(applyKeypadIncrement('22,5', -2.5)).toBe('20')
    expect(applyKeypadIncrement('20', 5)).toBe('25')
  })
  it('starts from 0 when empty', () => {
    expect(applyKeypadIncrement('', 2.5)).toBe('2,5')
  })
  it('clamps to 0 (never negative)', () => {
    expect(applyKeypadIncrement('2,5', -5)).toBe('0')
  })
  it('handles small steps without FP noise', () => {
    expect(applyKeypadIncrement('1', 0.25)).toBe('1,25')
    expect(applyKeypadIncrement('0,25', 0.25)).toBe('0,5')
  })
})

describe('appendKeypadDigit', () => {
  it('appends digits', () => {
    expect(appendKeypadDigit('2', '5', WEIGHT)).toBe('25')
    expect(appendKeypadDigit('', '7', WEIGHT)).toBe('7')
  })
  it('strips leading zero', () => {
    expect(appendKeypadDigit('0', '5', WEIGHT)).toBe('5')
    expect(appendKeypadDigit('0', '0', WEIGHT)).toBe('0')
  })
  it('appends decimals after comma (weight)', () => {
    expect(appendKeypadDigit('0,', '5', WEIGHT)).toBe('0,5')
    expect(appendKeypadDigit('22,', '5', WEIGHT)).toBe('22,5')
  })
  it('caps decimals at 2 (weight)', () => {
    expect(appendKeypadDigit('1,25', '5', WEIGHT)).toBe('1,25')
  })
  it('ignores non-digits', () => {
    expect(appendKeypadDigit('2', 'x', WEIGHT)).toBe('2')
  })
})

describe('appendKeypadDecimal (peso permite una coma; reps la bloquea)', () => {
  it('adds a single comma', () => {
    expect(appendKeypadDecimal('22')).toBe('22,')
  })
  it('starts 0, when empty', () => {
    expect(appendKeypadDecimal('')).toBe('0,')
  })
  it('never adds a second comma', () => {
    expect(appendKeypadDecimal('22,5')).toBe('22,5')
  })
  // El bloqueo real en reps es de UI (el botón coma no se renderiza / allowDecimal=false),
  // pero la lógica de dígitos igual no crea decimales sin coma:
  it('reps: digits never produce a decimal (allowDecimal=false)', () => {
    let v = ''
    v = appendKeypadDigit(v, '1', REPS)
    v = appendKeypadDigit(v, '2', REPS)
    expect(v).toBe('12')
  })
})

describe('keypadBackspace', () => {
  it('removes the last char', () => {
    expect(keypadBackspace('22,5')).toBe('22,')
    expect(keypadBackspace('2')).toBe('')
    expect(keypadBackspace('')).toBe('')
  })
})

// Persistencia (readKeypadStep/writeKeypadStep): tests en
// apps/web/src/lib/client/keypad-step.test.ts (localStorage es capa web).
