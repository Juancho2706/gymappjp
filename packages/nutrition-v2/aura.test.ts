import { describe, expect, it } from 'vitest'
import {
  AURA_GLOW_ALPHA_MAX,
  AURA_GLOW_ALPHA_MIN,
  auraGlowAlpha,
  energyGoalReached,
  energyProgressRatio,
  firstNameFromFullName,
  greetingForHour,
} from './aura'

describe('greetingForHour', () => {
  it('elige la franja por hora local', () => {
    expect(greetingForHour(8)).toBe('¡Buenos días!')
    expect(greetingForHour(15)).toBe('¡Buenas tardes!')
    expect(greetingForHour(22)).toBe('¡Buenas noches!')
    expect(greetingForHour(3)).toBe('¡Buenas noches!')
  })

  it('bordes de las franjas', () => {
    expect(greetingForHour(5)).toBe('¡Buenos días!')
    expect(greetingForHour(11)).toBe('¡Buenos días!')
    expect(greetingForHour(12)).toBe('¡Buenas tardes!')
    expect(greetingForHour(19)).toBe('¡Buenas tardes!')
    expect(greetingForHour(20)).toBe('¡Buenas noches!')
    expect(greetingForHour(4)).toBe('¡Buenas noches!')
  })

  it('incluye el nombre cuando está disponible; sin nombre no agrega coma', () => {
    expect(greetingForHour(8, 'Ana')).toBe('¡Buenos días, Ana!')
    expect(greetingForHour(8, '  Ana  ')).toBe('¡Buenos días, Ana!')
    expect(greetingForHour(8, null)).toBe('¡Buenos días!')
    expect(greetingForHour(8, '   ')).toBe('¡Buenos días!')
  })

  it('hora inválida cae a mediodía (tardes) sin romper', () => {
    expect(greetingForHour(Number.NaN)).toBe('¡Buenas tardes!')
  })
})

describe('firstNameFromFullName', () => {
  it('toma el primer token', () => {
    expect(firstNameFromFullName('Ana María Pérez')).toBe('Ana')
    expect(firstNameFromFullName('Javier')).toBe('Javier')
  })

  it('vacío/espacios/nulo => null', () => {
    expect(firstNameFromFullName('')).toBeNull()
    expect(firstNameFromFullName('   ')).toBeNull()
    expect(firstNameFromFullName(null)).toBeNull()
    expect(firstNameFromFullName(undefined)).toBeNull()
  })
})

describe('energyProgressRatio', () => {
  it('fracción clamp 0..1', () => {
    expect(energyProgressRatio(0, 2000)).toBe(0)
    expect(energyProgressRatio(1000, 2000)).toBe(0.5)
    expect(energyProgressRatio(2000, 2000)).toBe(1)
    expect(energyProgressRatio(3000, 2000)).toBe(1)
  })

  it('sin meta (null/0/undefined) => 0, sin dividir por cero', () => {
    expect(energyProgressRatio(1500, null)).toBe(0)
    expect(energyProgressRatio(1500, 0)).toBe(0)
    expect(energyProgressRatio(1500, undefined)).toBe(0)
  })
})

describe('auraGlowAlpha', () => {
  it('crece MIN→MAX con el progreso y es monótona', () => {
    expect(auraGlowAlpha(0, 2000)).toBe(AURA_GLOW_ALPHA_MIN)
    expect(auraGlowAlpha(2000, 2000)).toBe(AURA_GLOW_ALPHA_MAX)
    expect(auraGlowAlpha(500, 2000)).toBeLessThanOrEqual(auraGlowAlpha(1500, 2000))
  })

  it('sin meta => alpha mínima (solo consumido)', () => {
    expect(auraGlowAlpha(1200, null)).toBe(AURA_GLOW_ALPHA_MIN)
    expect(auraGlowAlpha(1200, 0)).toBe(AURA_GLOW_ALPHA_MIN)
  })
})

describe('energyGoalReached', () => {
  it('true al alcanzar/cruzar la meta; false bajo la meta', () => {
    expect(energyGoalReached(2000, 2000)).toBe(true)
    expect(energyGoalReached(2100, 2000)).toBe(true)
    expect(energyGoalReached(1999, 2000)).toBe(false)
  })

  it('sin meta => nunca celebra', () => {
    expect(energyGoalReached(5000, null)).toBe(false)
    expect(energyGoalReached(5000, 0)).toBe(false)
  })
})
