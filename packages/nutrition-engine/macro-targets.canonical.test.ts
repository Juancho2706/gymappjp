import { describe, it, expect } from 'vitest'
import {
  computeMifflinStJeor,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from './tdee'

/**
 * Snapshot canónico de las metas nutricionales (kcal + macros) por perfil de alumno.
 *
 * Este test NO reimplementa las fórmulas: encadena las mismas funciones del engine
 * (Mifflin-St Jeor → TDEE → calorías → macros) que consumen el PlanBuilderSidebar de
 * web y el nutrition-builder de mobile, y fija sus outputs como verdad. Cualquier
 * cambio de fórmula (o un consumidor que vuelva a divergir con su propio cálculo)
 * hace fallar estos valores.
 *
 * REGLA: web (`apps/web`) y mobile (`apps/mobile`) deben calcular metas SOLO vía este
 * package. Prohibido copiar/portar estas fórmulas a otra parte (así nació el drift de
 * `apps/mobile/lib/macro-calculator.ts`, ya eliminado).
 */

type Profile = {
  label: string
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  activity: ActivityLevel
  goal: Goal
}

// Espejo exacto del wrapper `calcMacros` que usan web y mobile (misma firma/orden).
function resolveTargets(p: Profile) {
  const bmr = computeMifflinStJeor({
    sex: p.sex,
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    age: p.age,
  })
  const tdee = computeTDEE(bmr, p.activity)
  const calories = deriveCalorieTarget(tdee, p.goal)
  const macros = deriveMacroTargets(calories, p.weightKg, p.goal)
  return {
    calories,
    protein: macros.protein_g,
    carbs: macros.carbs_g,
    fats: macros.fats_g,
  }
}

describe('canonical macro targets (drift guard web ↔ mobile)', () => {
  it('hombre 80kg/180cm/30y · moderado · volumen', () => {
    expect(
      resolveTargets({
        label: 'gain',
        sex: 'male',
        weightKg: 80,
        heightCm: 180,
        age: 30,
        activity: 'moderate',
        goal: 'gain',
      })
    ).toEqual({ calories: 3035, protein: 128, carbs: 442, fats: 84 })
  })

  it('mujer 60kg/165cm/28y · ligero · déficit', () => {
    expect(
      resolveTargets({
        label: 'lose',
        sex: 'female',
        weightKg: 60,
        heightCm: 165,
        age: 28,
        activity: 'light',
        goal: 'lose',
      })
    ).toEqual({ calories: 1555, protein: 132, carbs: 140, fats: 52 })
  })

  it('mujer 70kg/175cm/40y · moderado · mantención', () => {
    expect(
      resolveTargets({
        label: 'maintain',
        sex: 'female',
        weightKg: 70,
        heightCm: 175,
        age: 40,
        activity: 'moderate',
        goal: 'maintain',
      })
    ).toEqual({ calories: 2221, protein: 126, carbs: 276, fats: 68 })
  })
})
