import { describe, expect, it } from 'vitest'
import {
  computeNutritionAdherence,
  type AdherenceMeal,
  type MacroTarget,
  type MealLogRow,
} from './index'

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN FIXTURES — motor canónico de adherencia.
//
// Plan con alimentos mixtos g / ml / un, una comida scopeada a un día de semana,
// consumed_quantity parcial, y un día SIN snapshot de target (fallback liveTarget).
// Los números esperados están calculados a mano (ver comentarios) para detectar
// cualquier drift del motor.
//
// Resolver determinista (sin TZ): mapea las fechas del fixture a 1=Lun…7=Dom.
//   2026-06-15 = Lunes    (1)
//   2026-06-16 = Martes   (2)
//   2026-06-17 = Miércoles(3)
//   2026-06-18 = Jueves   (4)
// ─────────────────────────────────────────────────────────────────────────────

const DOW: Record<string, number> = {
  '2026-06-15': 1,
  '2026-06-16': 2,
  '2026-06-17': 3,
  '2026-06-18': 4,
}
const dayOfWeekResolver = (isoYmd: string): number => DOW[isoYmd] ?? 1

// Meal A — pollo (g) + aceite (ml). Aplica todos los días (day_of_week null).
//   pollo  100cal/20p/0c/2f por 100g, serving 100, 150 g  → x1.5  → 150 / 30 / 0 / 3
//   aceite 884cal/0p/0c/100f por 100ml, serving 14, 15 ml → x0.15 → 132.6 / 0 / 0 / 15
//   TOTAL A = 282.6 / 30 / 0 / 18
const mealA: AdherenceMeal = {
  id: 'meal-a',
  day_of_week: null,
  food_items: [
    {
      quantity: 150,
      unit: 'g',
      foods: {
        name: 'Pollo',
        calories: 100,
        protein_g: 20,
        carbs_g: 0,
        fats_g: 2,
        serving_size: 100,
        serving_unit: 'g',
      },
    },
    {
      quantity: 15,
      unit: 'ml',
      foods: {
        name: 'Aceite',
        calories: 884,
        protein_g: 0,
        carbs_g: 0,
        fats_g: 100,
        serving_size: 14,
        serving_unit: 'ml',
      },
    },
  ],
}

// Meal B — huevo (un). Aplica todos los días.
//   huevo 155cal/13p/1.1c/11f por 100g, serving 60, 2 un → x1.2 → 186 / 15.6 / 1.3 / 13.2
//   (carbs: 1.1*1.2 = 1.32 → round(13.2)/10 = 1.3)
const mealB: AdherenceMeal = {
  id: 'meal-b',
  day_of_week: null,
  food_items: [
    {
      quantity: 2,
      unit: 'un',
      foods: {
        name: 'Huevo',
        calories: 155,
        protein_g: 13,
        carbs_g: 1.1,
        fats_g: 11,
        serving_size: 60,
        serving_unit: 'g',
      },
    },
  ],
}

// Meal C — arroz (g). SOLO miércoles (day_of_week 3).
//   arroz 130cal/2.7p/28c/0.3f por 100g, serving 100, 200 g → x2 → 260 / 5.4 / 56 / 0.6
const mealC: AdherenceMeal = {
  id: 'meal-c',
  day_of_week: 3,
  food_items: [
    {
      quantity: 200,
      unit: 'g',
      foods: {
        name: 'Arroz',
        calories: 130,
        protein_g: 2.7,
        carbs_g: 28,
        fats_g: 0.3,
        serving_size: 100,
        serving_unit: 'g',
      },
    },
  ],
}

const meals: AdherenceMeal[] = [mealA, mealB, mealC]

const liveTarget: MacroTarget = { calories: 2000, protein: 150, carbs: 200, fats: 60 }
const snapshot15: MacroTarget = { calories: 1800, protein: 140, carbs: 180, fats: 55 }

const logsByDate = new Map<string, MealLogRow[]>([
  // Lun 15: solo meal-a completa (full). → done 1 / applicable 2
  ['2026-06-15', [{ meal_id: 'meal-a', is_completed: true }]],
  // Mar 16: meal-a parcial 50%, meal-b full. → done 2 / applicable 2
  [
    '2026-06-16',
    [
      { meal_id: 'meal-a', is_completed: true, consumed_quantity: 50 },
      { meal_id: 'meal-b', is_completed: true },
    ],
  ],
  // Mié 17: meal-a full + meal-c full (meal-b NO logueada). applicable 3 (a,b,c) → done 2
  [
    '2026-06-17',
    [
      { meal_id: 'meal-a', is_completed: true },
      { meal_id: 'meal-c', is_completed: true },
    ],
  ],
  // Jue 18: SIN logs.
])

// targetByDate solo tiene snapshot para el 15. 16/17/18 → fallback liveTarget.
const targetByDate = new Map<string, MacroTarget>([['2026-06-15', snapshot15]])

function run() {
  return computeNutritionAdherence({
    meals,
    logsByDate,
    targetByDate,
    liveTarget,
    range: { startIso: '2026-06-15', endIso: '2026-06-18' },
    dayOfWeekResolver,
  })
}

const approx = (n: number) => Math.round(n * 100) / 100

describe('computeNutritionAdherence — golden fixtures', () => {
  it('enumera los 4 días del rango inclusive', () => {
    const out = run()
    expect(out.perDay.map((d) => d.date)).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ])
  })

  it('Lun 15: applicable=2 (a,b), done=1, compliance 50%, consumo = meal-a full', () => {
    const d = run().perDay[0]
    expect(d.applicableMeals).toBe(2)
    expect(d.mealsDone).toBe(1)
    expect(d.mealsTotal).toBe(3)
    expect(d.compliancePct).toBe(50)
    expect(d.hasLog).toBe(true)
    expect(d.consumedMacros).toEqual({ calories: 282.6, protein: 30, carbs: 0, fats: 18 })
    // snapshot del día presente → NO usa liveTarget
    expect(d.targetMacros).toEqual(snapshot15)
  })

  it('Mar 16: consumo parcial (meal-a 50% + meal-b full); target = liveTarget (sin snapshot)', () => {
    const d = run().perDay[1]
    expect(d.applicableMeals).toBe(2)
    expect(d.mealsDone).toBe(2)
    expect(d.compliancePct).toBe(100)
    // a*0.5 = 141.3 / 15 / 0 / 9 ; b = 186 / 15.6 / 1.3 / 13.2
    expect(approx(d.consumedMacros.calories)).toBe(327.3)
    expect(approx(d.consumedMacros.protein)).toBe(30.6)
    expect(approx(d.consumedMacros.carbs)).toBe(1.3)
    expect(approx(d.consumedMacros.fats)).toBe(22.2)
    expect(d.targetMacros).toEqual(liveTarget)
  })

  it('Mié 17: comida scopeada a miércoles aplica → applicable=3, done=2, compliance 66.67%', () => {
    const d = run().perDay[2]
    expect(d.applicableMeals).toBe(3)
    expect(d.mealsDone).toBe(2)
    expect(approx(d.compliancePct)).toBe(66.67)
    // a + c = 542.6 / 35.4 / 56 / 18.6
    expect(approx(d.consumedMacros.calories)).toBe(542.6)
    expect(approx(d.consumedMacros.protein)).toBe(35.4)
    expect(approx(d.consumedMacros.carbs)).toBe(56)
    expect(approx(d.consumedMacros.fats)).toBe(18.6)
    expect(d.targetMacros).toEqual(liveTarget)
  })

  it('Jue 18: meal-c NO aplica (no es miércoles), sin logs → applicable=2, done=0, compliance 0', () => {
    const d = run().perDay[3]
    expect(d.applicableMeals).toBe(2)
    expect(d.mealsDone).toBe(0)
    expect(d.compliancePct).toBe(0)
    expect(d.hasLog).toBe(false)
    expect(d.consumedMacros).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 })
  })

  it('summary.compliancePct = sum(done)/sum(applicable), NO el promedio de los % diarios', () => {
    const out = run()
    // sum done = 1+2+2+0 = 5 ; sum applicable = 2+2+3+2 = 9 → 55.555…%
    expect(approx(out.summary.compliancePct)).toBe(55.56)
    // El promedio de los % diarios (50+100+66.67+0)/4 = 54.17 — DISTINTO. Verifica
    // que el motor NO promedia porcentajes.
    expect(out.summary.compliancePct).not.toBeCloseTo(54.17, 1)
  })

  it('loggingEngagementPct es un campo SEPARADO de compliancePct (engagement ≠ compliance)', () => {
    const out = run()
    // 3 de 4 días con al menos un log → 75%
    expect(out.summary.loggingEngagementPct).toBe(75)
    // Distinto del compliance (55.56%) → confirma que NO se fusionan.
    expect(out.summary.loggingEngagementPct).not.toBe(out.summary.compliancePct)
  })

  it('summary.consumedMacros y targetMacros son la suma del rango (todos los macros)', () => {
    const out = run()
    // consumo: 15 (282.6/30/0/18) + 16 (327.3/30.6/1.3/22.2) + 17 (542.6/35.4/56/18.6) + 18 (0)
    expect(approx(out.summary.consumedMacros.calories)).toBe(1152.5)
    expect(approx(out.summary.consumedMacros.protein)).toBe(96)
    expect(approx(out.summary.consumedMacros.carbs)).toBe(57.3)
    expect(approx(out.summary.consumedMacros.fats)).toBe(58.8)
    // target: snapshot15 (1800/140/180/55) + live*3 (2000/150/200/60)
    expect(out.summary.targetMacros).toEqual({
      calories: 1800 + 2000 * 3,
      protein: 140 + 150 * 3,
      carbs: 180 + 200 * 3,
      fats: 55 + 60 * 3,
    })
  })

  it('streak: longest=1 (solo Mar 16 fue full-completion), current=0 (último día rompe)', () => {
    const out = run()
    expect(out.summary.streak.longest).toBe(1)
    expect(out.summary.streak.current).toBe(0)
  })
})

describe('computeNutritionAdherence — fallback completion (meals sin macros)', () => {
  it('usa el target del día como base cuando ninguna comida tiene macros', () => {
    const emptyMeal: AdherenceMeal = {
      id: 'm1',
      day_of_week: null,
      food_items: [],
    }
    const out = computeNutritionAdherence({
      meals: [emptyMeal, { id: 'm2', day_of_week: null, food_items: [] }],
      logsByDate: new Map([['2026-06-15', [{ meal_id: 'm1', is_completed: true }]]]),
      liveTarget,
      range: { startIso: '2026-06-15', endIso: '2026-06-15' },
      dayOfWeekResolver,
    })
    const d = out.perDay[0]
    // 1 de 2 comidas completas, sin macros → fallback = target * (1/2)
    expect(d.consumedMacros).toEqual({
      calories: liveTarget.calories / 2,
      protein: liveTarget.protein / 2,
      carbs: liveTarget.carbs / 2,
      fats: liveTarget.fats / 2,
    })
    expect(d.compliancePct).toBe(50)
  })
})
