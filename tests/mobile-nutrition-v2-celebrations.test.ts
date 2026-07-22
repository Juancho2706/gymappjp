import { describe, expect, it } from 'vitest'
import {
  celebrationAnimationPlan,
  dayClosedDailyKey,
  decideDayCloseCelebration,
  decideEnergyGoalCelebration,
  decideMealLoggedCelebration,
  decideScannerHitCelebration,
  isNutritionDayComplete,
  mealLoggedDailyKey,
  scannerHitKey,
} from '../apps/mobile/lib/nutrition-v2-celebrations'

describe('nutrición v2 · celebraciones (decisión pura, no tóxica)', () => {
  it('registro: micro-pop SOLO la primera vez del día, luego silencio', () => {
    expect(decideMealLoggedCelebration(false)).toEqual({ kind: 'badge', badge: 'primer-registro', variant: 'micro' })
    // Ya se celebró hoy → nada (no spamear cada registro, cero culpa).
    expect(decideMealLoggedCelebration(true)).toBeNull()
  })

  it('cierre del día: celebración completa solo si el día está completo y no se celebró aún', () => {
    expect(decideDayCloseCelebration(true, false)).toEqual({ kind: 'badge', badge: 'dia-cerrado', variant: 'full' })
    // Día incompleto → nunca celebra (jamás "te falta / perdiste").
    expect(decideDayCloseCelebration(false, false)).toBeNull()
    // Ya celebrado hoy → no repite.
    expect(decideDayCloseCelebration(true, true)).toBeNull()
  })

  it('scanner: pop corto SOLO la primera vez absoluta', () => {
    expect(decideScannerHitCelebration(false)).toEqual({ kind: 'badge', badge: 'primer-escaneo', variant: 'micro' })
    expect(decideScannerHitCelebration(true)).toBeNull()
  })

  it('meta de energía: presentación propia (kind energy-goal), SOLO al cruzar la meta 1×/día', () => {
    // No alcanzada → silencio (jamás "te falta" ni déficit).
    expect(decideEnergyGoalCelebration(false, false)).toBeNull()
    // Ya celebrada hoy → no repite (paridad 1×/fecha con el web).
    expect(decideEnergyGoalCelebration(true, true)).toBeNull()
    // Alcanzada y sin celebrar → celebración de meta de energía (no el badge dia-cerrado).
    expect(decideEnergyGoalCelebration(true, false)).toEqual({ kind: 'energy-goal', variant: 'full' })
  })
})

describe('nutrición v2 · isNutritionDayComplete (hábito, no calorías)', () => {
  it('completo cuando toda franja prescrita tiene consumo', () => {
    expect(
      isNutritionDayComplete([
        { hasPrescription: true, hasConsumption: true },
        { hasPrescription: true, hasConsumption: true },
      ]),
    ).toBe(true)
  })

  it('incompleto si alguna franja prescrita no tiene consumo', () => {
    expect(
      isNutritionDayComplete([
        { hasPrescription: true, hasConsumption: true },
        { hasPrescription: true, hasConsumption: false },
      ]),
    ).toBe(false)
  })

  it('las franjas flexibles (sin prescripción) no cuentan para el cierre', () => {
    // Solo franjas flexibles → sin cierre automático (no forzamos una meta).
    expect(
      isNutritionDayComplete([
        { hasPrescription: false, hasConsumption: false },
        { hasPrescription: false, hasConsumption: true },
      ]),
    ).toBe(false)
    // Una prescrita cumplida + flexibles ignoradas → completo.
    expect(
      isNutritionDayComplete([
        { hasPrescription: true, hasConsumption: true },
        { hasPrescription: false, hasConsumption: false },
      ]),
    ).toBe(true)
  })

  it('sin franjas → no está completo', () => {
    expect(isNutritionDayComplete([])).toBe(false)
  })
})

describe('nutrición v2 · claves de persistencia (scoped por usuario/fecha)', () => {
  it('la marca diaria de registro es por usuario + fecha', () => {
    expect(mealLoggedDailyKey('u1', '2026-07-16')).toBe('nutriCeleb:meal:u1:2026-07-16')
    // Distinto usuario o distinta fecha → distinta clave (no se pisan).
    expect(mealLoggedDailyKey('u2', '2026-07-16')).not.toBe(mealLoggedDailyKey('u1', '2026-07-16'))
    expect(mealLoggedDailyKey('u1', '2026-07-17')).not.toBe(mealLoggedDailyKey('u1', '2026-07-16'))
  })

  it('la marca de cierre del día es por usuario + fecha y distinta de la de registro', () => {
    expect(dayClosedDailyKey('u1', '2026-07-16')).toBe('nutriCeleb:dayclose:u1:2026-07-16')
    expect(dayClosedDailyKey('u1', '2026-07-16')).not.toBe(mealLoggedDailyKey('u1', '2026-07-16'))
  })

  it('la marca de escaneo es persistente por usuario (sin fecha)', () => {
    expect(scannerHitKey('u1')).toBe('nutriCeleb:scan:u1')
    expect(scannerHitKey('u2')).not.toBe(scannerHitKey('u1'))
  })
})

describe('nutrición v2 · celebrationAnimationPlan (reduced-motion => estática)', () => {
  it('reduced-motion: SIN partículas, entrada fade, háptico se mantiene', () => {
    const full = celebrationAnimationPlan('full', true)
    expect(full.confetti).toBe(false)
    expect(full.particleCount).toBe(0)
    expect(full.entrance).toBe('fade')
    expect(full.haptic).toBe(true)

    const micro = celebrationAnimationPlan('micro', true)
    expect(micro.confetti).toBe(false)
    expect(micro.particleCount).toBe(0)
    expect(micro.entrance).toBe('fade')
  })

  it('full con movimiento: confeti con 8-12 partículas y spring', () => {
    const full = celebrationAnimationPlan('full', false)
    expect(full.confetti).toBe(true)
    expect(full.particleCount).toBeGreaterThanOrEqual(8)
    expect(full.particleCount).toBeLessThanOrEqual(12)
    expect(full.entrance).toBe('spring')
    expect(full.visibleMs).toBeGreaterThan(celebrationAnimationPlan('micro', false).visibleMs)
  })

  it('micro con movimiento: confeti liviano (8-12) y spring corto', () => {
    const micro = celebrationAnimationPlan('micro', false)
    expect(micro.confetti).toBe(true)
    expect(micro.particleCount).toBeGreaterThanOrEqual(8)
    expect(micro.particleCount).toBeLessThanOrEqual(12)
    expect(micro.entrance).toBe('spring')
  })

  it('kind badge por defecto: sin cambios respecto de la firma previa', () => {
    // El tercer parámetro `kind` es opcional y por defecto 'badge' → plan intacto.
    expect(celebrationAnimationPlan('full', false)).toEqual(celebrationAnimationPlan('full', false, 'badge'))
    expect(celebrationAnimationPlan('micro', true)).toEqual(celebrationAnimationPlan('micro', true, 'badge'))
  })

  it('meta de energía: overlay 3000ms con confeti (12) tintado y spring; paridad web', () => {
    const plan = celebrationAnimationPlan('full', false, 'energy-goal')
    expect(plan.confetti).toBe(true)
    expect(plan.particleCount).toBe(12)
    expect(plan.entrance).toBe('spring')
    expect(plan.visibleMs).toBe(3000)
    expect(plan.haptic).toBe(true)
  })

  it('meta de energía con reduce-motion: 4000ms, SIN partículas, fade y háptico', () => {
    const plan = celebrationAnimationPlan('full', true, 'energy-goal')
    expect(plan.confetti).toBe(false)
    expect(plan.particleCount).toBe(0)
    expect(plan.entrance).toBe('fade')
    expect(plan.visibleMs).toBe(4000)
    expect(plan.haptic).toBe(true)
  })
})
