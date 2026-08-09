import { describe, expect, it } from 'vitest'
import {
  CUSTOM_FOOD_ALL_ZERO_MESSAGE,
  parseCustomFoodMacro,
  readCustomFoodMacroDraft,
  validateCustomFoodMacros,
  type CustomFoodMacroDraft,
} from './custom-food-macros'

function draft(overrides: Partial<CustomFoodMacroDraft> = {}): CustomFoodMacroDraft {
  return { calories: '155', protein: '13', carbs: '1', fats: '11', ...overrides }
}

describe('validateCustomFoodMacros (invariante 6 de T2.3)', () => {
  it('deja pasar un alimento con los cuatro valores', () => {
    expect(validateCustomFoodMacros(draft())).toBeNull()
  })

  it('acepta macros en 0 mientras alguno del cuarteto no lo este (aceite: 0 P, 0 C)', () => {
    expect(validateCustomFoodMacros(draft({ calories: '884', protein: '0', carbs: '0', fats: '100' }))).toBeNull()
  })

  it('acepta decimales', () => {
    expect(validateCustomFoodMacros(draft({ protein: '12.5' }))).toBeNull()
  })

  it('acepta coma decimal (pegado o autofill)', () => {
    expect(validateCustomFoodMacros(draft({ fats: '11,4' }))).toBeNull()
  })

  it.each([
    ['calories', 'Ingresa las calorías por 100 g.'],
    ['protein', 'Ingresa la proteína por 100 g (pon 0 si no tiene).'],
    ['carbs', 'Ingresa los carbohidratos por 100 g (pon 0 si no tiene).'],
    ['fats', 'Ingresa las grasas por 100 g (pon 0 si no tiene).'],
  ] as const)('exige %s cuando llega en blanco', (field, message) => {
    const issue = validateCustomFoodMacros(draft({ [field]: '' }))
    expect(issue).toEqual({ field, message })
  })

  it('trata los espacios en blanco como campo vacio', () => {
    expect(validateCustomFoodMacros(draft({ carbs: '   ' }))?.field).toBe('carbs')
  })

  it('rechaza texto que no es numero', () => {
    expect(validateCustomFoodMacros(draft({ calories: 'mucha' }))).toEqual({
      field: 'calories',
      message: 'Las calorías deben ser un número.',
    })
  })

  it('rechaza negativos antes de llegar al servidor', () => {
    expect(validateCustomFoodMacros(draft({ fats: '-1' }))).toEqual({
      field: 'fats',
      message: 'Las grasas no pueden ser negativas.',
    })
  })

  it('usa los MISMOS topes que CustomFoodSchema', () => {
    expect(validateCustomFoodMacros(draft({ calories: '9000' }))).toBeNull()
    expect(validateCustomFoodMacros(draft({ calories: '9001' }))?.message).toBe('Máximo 9000 kcal por 100 g.')
    expect(validateCustomFoodMacros(draft({ protein: '500' }))).toBeNull()
    expect(validateCustomFoodMacros(draft({ protein: '501' }))?.message).toBe(
      'Máximo 500 g de proteína por 100 g.',
    )
  })

  it('bloquea el alimento con los cuatro en 0 y apunta el foco a kcal', () => {
    expect(validateCustomFoodMacros({ calories: '0', protein: '0', carbs: '0', fats: '0' })).toEqual({
      field: 'calories',
      message: CUSTOM_FOOD_ALL_ZERO_MESSAGE,
    })
  })

  it('reporta el campo concreto antes que el error cruzado de "todo en 0"', () => {
    const issue = validateCustomFoodMacros({ calories: '0', protein: '0', carbs: '', fats: '0' })
    expect(issue?.field).toBe('carbs')
    expect(issue?.message).not.toBe(CUSTOM_FOOD_ALL_ZERO_MESSAGE)
  })

  it('respeta el orden del formulario al reportar (kcal antes que grasas)', () => {
    expect(validateCustomFoodMacros(draft({ calories: '', fats: '' }))?.field).toBe('calories')
  })
})

describe('readCustomFoodMacroDraft', () => {
  it('lee los mismos `name` que emite el formulario y consume saveCustomFood', () => {
    const formData = new FormData()
    formData.set('name', 'Huevo cocido')
    formData.set('calories', '155')
    formData.set('protein', '13')
    formData.set('carbs', '1')
    formData.set('fats', '11')

    expect(readCustomFoodMacroDraft(formData)).toEqual({
      calories: '155',
      protein: '13',
      carbs: '1',
      fats: '11',
    })
  })

  it('un campo ausente llega como cadena vacia y la validacion lo reclama', () => {
    const formData = new FormData()
    formData.set('calories', '155')
    formData.set('protein', '13')
    formData.set('fats', '11')

    const draft = readCustomFoodMacroDraft(formData)
    expect(draft.carbs).toBe('')
    expect(validateCustomFoodMacros(draft)?.field).toBe('carbs')
  })
})

describe('parseCustomFoodMacro', () => {
  it('distingue vacio, invalido y valor', () => {
    expect(parseCustomFoodMacro('')).toEqual({ state: 'empty' })
    expect(parseCustomFoodMacro('  ')).toEqual({ state: 'empty' })
    expect(parseCustomFoodMacro('abc')).toEqual({ state: 'invalid' })
    expect(parseCustomFoodMacro('Infinity')).toEqual({ state: 'invalid' })
    expect(parseCustomFoodMacro('0')).toEqual({ state: 'value', value: 0 })
    expect(parseCustomFoodMacro('7,5')).toEqual({ state: 'value', value: 7.5 })
  })
})
