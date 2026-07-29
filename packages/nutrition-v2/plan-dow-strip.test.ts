import { describe, expect, it } from 'vitest'
import {
  buildNutritionPlanDowStrip,
  describeNutritionPlanDowSelection,
  formatNutritionPlanDowCalories,
  formatNutritionPlanDowCellAccessibilityLabel,
  formatNutritionPlanDowStats,
  initialNutritionPlanDow,
  isNutritionPlanDowUniform,
  summarizeNutritionPlanDowVariant,
} from './plan-dow-strip'

interface Variant {
  id: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  targets: { calories: number | null }
  mealSlots: Array<{
    prescriptionItems: Array<{ macros: { calories: number | null } }>
    exchangeTargets?: Array<{ portions: number }>
  }>
}

const base: Variant = {
  id: 'base',
  label: 'Día base',
  dayOfWeek: null,
  isDefault: true,
  targets: { calories: 2200 },
  mealSlots: [
    { prescriptionItems: [{ macros: { calories: 228 } }, { macros: { calories: 105 } }] },
    { prescriptionItems: [{ macros: { calories: 1847 } }] },
  ],
}

const sabado: Variant = {
  id: 'sa',
  label: 'Día libre controlado',
  dayOfWeek: 6,
  isDefault: false,
  targets: { calories: 2700 },
  mealSlots: [
    {
      prescriptionItems: [{ macros: { calories: 420 } }],
      exchangeTargets: [{ portions: 2 }, { portions: 1.5 }],
    },
  ],
}

const variants = [base, sabado]

describe('summarizeNutritionPlanDowVariant', () => {
  it('las kcal prescritas mandan sobre el objetivo y se informa la fuente', () => {
    const totals = summarizeNutritionPlanDowVariant(base)
    expect(totals.prescribedCalories).toBe(2180)
    expect(totals.targetCalories).toBe(2200)
    expect(totals.displayCalories).toBe(2180)
    expect(totals.caloriesSource).toBe('prescribed')
    expect(totals.slotCount).toBe(2)
    expect(totals.itemCount).toBe(3)
    expect(totals.portionCount).toBe(0)
  })

  it('sin items con kcal cae al objetivo (nunca a un 0 inventado)', () => {
    const soloPorciones = {
      id: 'p',
      label: 'Porciones',
      dayOfWeek: null,
      isDefault: true,
      targets: { calories: 1800 },
      mealSlots: [{ prescriptionItems: [], exchangeTargets: [{ portions: 3 }] }],
    }
    const totals = summarizeNutritionPlanDowVariant(soloPorciones)
    expect(totals.prescribedCalories).toBeNull()
    expect(totals.displayCalories).toBe(1800)
    expect(totals.caloriesSource).toBe('target')
    expect(totals.portionCount).toBe(3)
  })

  it('sin objetivo ni items la energía queda en null, no en 0', () => {
    const vacio = {
      id: 'v',
      label: 'Vacío',
      dayOfWeek: null,
      isDefault: true,
      targets: { calories: null },
      mealSlots: [],
    }
    const totals = summarizeNutritionPlanDowVariant(vacio)
    expect(totals.displayCalories).toBeNull()
    expect(totals.caloriesSource).toBeNull()
  })
})

describe('buildNutritionPlanDowStrip', () => {
  it('marca día propio vs heredado con la misma regla del snapshot', () => {
    // 2026-07-29 = miércoles.
    const cells = buildNutritionPlanDowStrip({ variants, todayIso: '2026-07-29' })
    expect(cells.map((cell) => cell.shortLabel)).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    const lunes = cells[0]
    expect(lunes.inheritsBase).toBe(true)
    expect(lunes.isOwnDay).toBe(false)
    expect(lunes.variant?.id).toBe('base')
    expect(lunes.displayCalories).toBe(2180)
    const sab = cells[5]
    expect(sab.isOwnDay).toBe(true)
    expect(sab.inheritsBase).toBe(false)
    expect(sab.variant?.id).toBe('sa')
    expect(sab.portionCount).toBe(3.5)
    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.shortLabel)).toEqual(['Mi'])
  })

  it('sin variante base los días sin match quedan sin estructura', () => {
    const cells = buildNutritionPlanDowStrip({ variants: [sabado], todayIso: null })
    expect(cells[5].variant?.id).toBe('sa')
    expect(cells[0].variant).toBeNull()
    expect(cells[0].displayCalories).toBeNull()
  })
})

describe('isNutritionPlanDowUniform', () => {
  it('true con una sola variante base (el selector no aporta)', () => {
    expect(isNutritionPlanDowUniform(buildNutritionPlanDowStrip({ variants: [base] }))).toBe(true)
  })

  it('false en cuanto hay un día propio', () => {
    expect(isNutritionPlanDowUniform(buildNutritionPlanDowStrip({ variants }))).toBe(false)
  })
})

describe('describeNutritionPlanDowSelection', () => {
  const cells = buildNutritionPlanDowStrip({ variants, todayIso: '2026-07-29' })

  it('día heredado: dice a quién sigue y con qué días comparte', () => {
    const selection = describeNutritionPlanDowSelection({ cells, dayOfWeek: 1 })
    expect(selection?.kind).toBe('inherited')
    expect(selection?.title).toBe('Lunes sigue el Día base')
    expect(selection?.sharedLabel).toBe('Igual que Ma · Mi · Ju · Vi · Do')
    expect(selection?.statsLabel).toBe('2.180 kcal prescritas · 2 franjas')
  })

  it('día propio: nombre personalizado, sin frase de herencia', () => {
    const selection = describeNutritionPlanDowSelection({ cells, dayOfWeek: 6 })
    expect(selection?.kind).toBe('own')
    expect(selection?.title).toBe('Sábado · Día libre controlado')
    expect(selection?.sharedLabel).toBeNull()
    expect(selection?.statsLabel).toBe('420 kcal prescritas · 1 franja · 3,5 porciones')
  })

  it('día propio sin nombre propio dice "día propio" (no repite el día)', () => {
    const domingo = { ...sabado, id: 'do', label: 'Domingo', dayOfWeek: 0 }
    const ownCells = buildNutritionPlanDowStrip({ variants: [base, domingo] })
    const selection = describeNutritionPlanDowSelection({ cells: ownCells, dayOfWeek: 0 })
    expect(selection?.title).toBe('Domingo · día propio')
    expect(selection?.variantLabel).toBeNull()
  })

  it('plan de un solo día: el heredado dice "Igual todos los días"', () => {
    const soloBase = buildNutritionPlanDowStrip({ variants: [base] })
    expect(describeNutritionPlanDowSelection({ cells: soloBase, dayOfWeek: 3 })?.sharedLabel).toBe(
      'Igual todos los días',
    )
  })

  it('sin estructura para el día lo dice sin inventar variante', () => {
    const cellsSinBase = buildNutritionPlanDowStrip({ variants: [sabado] })
    const selection = describeNutritionPlanDowSelection({ cells: cellsSinBase, dayOfWeek: 1 })
    expect(selection?.kind).toBe('none')
    expect(selection?.title).toBe('Lunes · sin estructura prescrita')
    expect(selection?.statsLabel).toBeNull()
  })
})

describe('formatNutritionPlanDowStats / initialNutritionPlanDow', () => {
  it('omite las piezas que no existen', () => {
    expect(
      formatNutritionPlanDowStats({
        slotCount: 0,
        itemCount: 0,
        portionCount: 0,
        prescribedCalories: null,
        targetCalories: 1900,
        displayCalories: 1900,
        caloriesSource: 'target',
      }),
    ).toBe('1.900 kcal de objetivo')
  })

  it('arranca en hoy cuando la semana lo trae', () => {
    // 2026-08-01 = sábado.
    const cells = buildNutritionPlanDowStrip({ variants, todayIso: '2026-08-01' })
    expect(initialNutritionPlanDow(cells)).toBe(6)
  })

  it('sin hoy arranca en el primer día con estructura', () => {
    const cells = buildNutritionPlanDowStrip({ variants: [sabado], todayIso: null })
    expect(initialNutritionPlanDow(cells)).toBe(6)
  })

  it('la celda muestra solo el número y la unidad va en el aria-label', () => {
    const cells = buildNutritionPlanDowStrip({ variants, todayIso: '2026-08-01' })
    expect(formatNutritionPlanDowCalories(cells[0].displayCalories)).toBe('2.180')
    expect(formatNutritionPlanDowCalories(null)).toBe('—')
    expect(formatNutritionPlanDowCellAccessibilityLabel(cells[5])).toBe(
      'Sábado, día propio, 420 kcal prescritas, hoy',
    )
    expect(formatNutritionPlanDowCellAccessibilityLabel(cells[0])).toBe(
      'Lunes, sigue el día base, 2.180 kcal prescritas',
    )
  })
})
