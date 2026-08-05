import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_FACTORS,
  computeMifflinStJeor,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
} from '@eva/nutrition-engine'
import {
  SUGGESTION_ACTIVITY_OPTIONS,
  SUGGESTION_GOAL_OPTIONS,
  formatProteinPerKg,
  initialSuggestionForm,
  parseSuggestionNumber,
  suggestTargets,
  type SuggestionForm,
} from './target-suggestion'

const BASE: SuggestionForm = {
  age: '30',
  weightKg: '70',
  heightCm: '175',
  sex: 'male',
  activity: 'moderate',
  goal: 'maintain',
}

describe('suggestTargets — mapper puro sobre el motor de TDEE', () => {
  it('reproduce EXACTAMENTE la cadena del motor (Mifflin -> TDEE -> kcal -> macros)', () => {
    const bmr = computeMifflinStJeor({ sex: 'male', weightKg: 70, heightCm: 175, age: 30 })
    const tdee = computeTDEE(bmr, ACTIVITY_FACTORS.moderate)
    const calories = deriveCalorieTarget(tdee, 'maintain')
    const macros = deriveMacroTargets(calories, 70, 'maintain')

    const suggestion = suggestTargets(BASE)
    expect(suggestion).not.toBeNull()
    expect(suggestion?.bmr).toBe(bmr)
    expect(suggestion?.tdee).toBe(tdee)
    expect(suggestion?.calories).toBe(calories)
    expect(suggestion?.proteinG).toBe(macros.protein_g)
    expect(suggestion?.carbsG).toBe(macros.carbs_g)
    expect(suggestion?.fatsG).toBe(macros.fats_g)
  })

  it('el déficit baja las kcal y el superávit las sube respecto de mantener', () => {
    const maintain = suggestTargets(BASE)?.calories ?? 0
    const lose = suggestTargets({ ...BASE, goal: 'lose' })?.calories ?? 0
    const gain = suggestTargets({ ...BASE, goal: 'gain' })?.calories ?? 0
    expect(lose).toBeLessThan(maintain)
    expect(gain).toBeGreaterThan(maintain)
    // -15% / +10%: los multiplicadores que anuncia la línea de supuestos.
    expect(lose).toBe(Math.round(maintain * 0.85))
    expect(gain).toBe(Math.round(maintain * 1.1))
  })

  it('más actividad = más calorías, con los factores del select', () => {
    const sedentary = suggestTargets({ ...BASE, activity: 'sedentary' })?.tdee ?? 0
    const veryActive = suggestTargets({ ...BASE, activity: 'very_active' })?.tdee ?? 0
    expect(veryActive).toBeGreaterThan(sedentary)
    expect(sedentary).toBe(Math.round((suggestTargets(BASE)?.bmr ?? 0) * ACTIVITY_FACTORS.sedentary))
  })

  it('el sexo cambia la constante de Mifflin-St Jeor (male +5 / female -161)', () => {
    const male = suggestTargets({ ...BASE, sex: 'male' })?.bmr ?? 0
    const female = suggestTargets({ ...BASE, sex: 'female' })?.bmr ?? 0
    expect(male - female).toBe(166)
  })

  it('los g/kg de la línea de supuestos salen del RESULTADO, no de una constante suelta', () => {
    const suggestion = suggestTargets({ ...BASE, goal: 'lose' })
    expect(suggestion).not.toBeNull()
    expect(suggestion?.proteinPerKg).toBe(Math.round(((suggestion?.proteinG ?? 0) / 70) * 10) / 10)
    expect(suggestion?.assumptions).toContain('Mifflin-St Jeor')
    expect(suggestion?.assumptions).toContain('actividad moderada')
    expect(suggestion?.assumptions).toContain('déficit 15%')
    expect(suggestion?.assumptions).toContain('g/kg')
  })

  it('la línea de supuestos nombra la actividad y el objetivo elegidos', () => {
    expect(suggestTargets({ ...BASE, activity: 'very_active', goal: 'gain' })?.assumptions).toContain(
      'actividad muy alta',
    )
    expect(suggestTargets({ ...BASE, activity: 'very_active', goal: 'gain' })?.assumptions).toContain('superávit 10%')
    expect(suggestTargets({ ...BASE, goal: 'maintain' })?.assumptions).toContain('mantención')
  })

  it('acepta coma decimal es-CL en peso y estatura', () => {
    const comma = suggestTargets({ ...BASE, weightKg: '70,5' })
    const dot = suggestTargets({ ...BASE, weightKg: '70.5' })
    expect(comma).toEqual(dot)
    expect(comma?.calories).not.toBe(suggestTargets(BASE)?.calories)
  })

  it('sin datos duros (o fuera de rango) NO inventa metas', () => {
    expect(suggestTargets({ ...BASE, age: '' })).toBeNull()
    expect(suggestTargets({ ...BASE, weightKg: '' })).toBeNull()
    expect(suggestTargets({ ...BASE, heightCm: '' })).toBeNull()
    expect(suggestTargets({ ...BASE, age: '4' })).toBeNull()
    expect(suggestTargets({ ...BASE, age: '140' })).toBeNull()
    expect(suggestTargets({ ...BASE, weightKg: '0' })).toBeNull()
    expect(suggestTargets({ ...BASE, weightKg: '-70' })).toBeNull()
    expect(suggestTargets({ ...BASE, heightCm: '20' })).toBeNull()
    expect(suggestTargets({ ...BASE, age: 'abc' })).toBeNull()
  })
})

describe('initialSuggestionForm', () => {
  it('precarga lo que sabemos del alumno y deja los defaults del producto', () => {
    const form = initialSuggestionForm({ age: 28, weightKg: 62.5, heightCm: 165, sex: 'female' })
    expect(form).toEqual({
      age: '28',
      weightKg: '62.5',
      heightCm: '165',
      sex: 'female',
      activity: 'moderate',
      goal: 'maintain',
    })
    expect(suggestTargets(form)).not.toBeNull()
  })

  it('sin alumno (plantilla) arranca vacío pero usable: el panel se llena a mano', () => {
    const form = initialSuggestionForm(null)
    expect(form.age).toBe('')
    expect(form.weightKg).toBe('')
    expect(form.heightCm).toBe('')
    expect(suggestTargets(form)).toBeNull()
    expect(suggestTargets({ ...form, age: '30', weightKg: '70', heightCm: '175' })).not.toBeNull()
  })

  it('un alumno a medias (sin peso) precarga lo que hay', () => {
    const form = initialSuggestionForm({ age: 40, weightKg: null, heightCm: 180, sex: null })
    expect(form.age).toBe('40')
    expect(form.weightKg).toBe('')
    expect(form.sex).toBe('female')
    expect(suggestTargets(form)).toBeNull()
  })
})

describe('helpers de formato', () => {
  it('parseSuggestionNumber acepta coma y rechaza basura', () => {
    expect(parseSuggestionNumber('2,5')).toBe(2.5)
    expect(parseSuggestionNumber(' 70 ')).toBe(70)
    expect(parseSuggestionNumber('')).toBeNull()
    expect(parseSuggestionNumber('hola')).toBeNull()
  })

  it('formatProteinPerKg redondea a un decimal con coma es-CL', () => {
    expect(formatProteinPerKg(2)).toBe('2')
    expect(formatProteinPerKg(2.04)).toBe('2')
    expect(formatProteinPerKg(1.85)).toBe('1,9')
    expect(formatProteinPerKg(2.2)).toBe('2,2')
  })

  it('las opciones del panel cubren los cinco factores y los tres objetivos', () => {
    expect(SUGGESTION_ACTIVITY_OPTIONS.map((o) => o.value)).toEqual([
      'sedentary',
      'light',
      'moderate',
      'active',
      'very_active',
    ])
    expect(SUGGESTION_GOAL_OPTIONS.map((o) => o.value)).toEqual(['lose', 'maintain', 'gain'])
  })
})
