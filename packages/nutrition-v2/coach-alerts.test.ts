import { describe, expect, it } from 'vitest'
import { deriveNutritionV2Alerts } from './coach-alerts'

// El caso real que abrió el tren: el alumno de Jean, 5.637 kcal registradas contra una meta de
// 1.556, con 5 registros de una versión anterior del plan aportando 4.470 de esas kcal.
describe('deriveNutritionV2Alerts', () => {
  it('sobre 2× la meta levanta la alerta danger con las dos cifras', () => {
    const [alert] = deriveNutritionV2Alerts({
      todayConsumedCalories: 5637,
      todayTargetCalories: 1556,
      priorVersionEntryCount: 0,
    })
    expect(alert).toMatchObject({ id: 'overconsumption', variant: 'danger' })
    expect(alert.description).toContain('5.637 kcal')
    expect(alert.description).toContain('1.556 kcal')
    expect(alert.description).toContain('más de 2×')
  })

  it('justo en 2× ya avisa; por debajo no', () => {
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 3112,
        todayTargetCalories: 1556,
        priorVersionEntryCount: 0,
      }).map((a) => a.id),
    ).toEqual(['overconsumption'])
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 3111,
        todayTargetCalories: 1556,
        priorVersionEntryCount: 0,
      }),
    ).toEqual([])
  })

  it('sin meta utilizable no se inventa la proporción', () => {
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 5637,
        todayTargetCalories: null,
        priorVersionEntryCount: 0,
      }),
    ).toEqual([])
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 5637,
        todayTargetCalories: 0,
        priorVersionEntryCount: 0,
      }),
    ).toEqual([])
  })

  it('los registros de una versión anterior son warning y concuerdan en número', () => {
    const [alert] = deriveNutritionV2Alerts({
      todayConsumedCalories: null,
      todayTargetCalories: null,
      priorVersionEntryCount: 5,
    })
    expect(alert).toMatchObject({ id: 'prior_version_entries', variant: 'warning' })
    expect(alert.description).toContain('5 registros de hoy son de una versión anterior del plan')
  })

  it('un solo huérfano se dice en singular', () => {
    const [alert] = deriveNutritionV2Alerts({
      todayConsumedCalories: null,
      todayTargetCalories: null,
      priorVersionEntryCount: 1,
    })
    expect(alert.description).toContain('1 registro de hoy es de una versión anterior del plan')
  })

  it('las dos señales conviven, primero la grave', () => {
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 5637,
        todayTargetCalories: 1556,
        priorVersionEntryCount: 5,
      }).map((a) => a.id),
    ).toEqual(['overconsumption', 'prior_version_entries'])
  })

  it('un día limpio no produce alertas', () => {
    expect(
      deriveNutritionV2Alerts({
        todayConsumedCalories: 1400,
        todayTargetCalories: 1556,
        priorVersionEntryCount: 0,
      }),
    ).toEqual([])
  })
})
