import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_COPY,
  EMPTY_FOOD_CLASSIFICATION,
  classificationPreview,
  draftFromClassification,
  hasClassificationChanges,
  parsePortionGrams,
  planFoodClassification,
  resolveCurrentClassification,
  validateFoodClassificationDraft,
  type FoodClassification,
} from './food-classification'

const GROUP_A = '11111111-1111-4111-8111-111111111111'
const GROUP_B = '22222222-2222-4222-8222-222222222222'
const FOOD = '33333333-3333-4333-8333-333333333333'

const groups = [
  { id: GROUP_A, name: 'Cereales' },
  { id: GROUP_B, name: 'Proteínas' },
]

describe('parsePortionGrams', () => {
  it('acepta coma decimal es-CL', () => {
    expect(parsePortionGrams('22,5')).toEqual({ state: 'value', value: 22.5 })
    expect(parsePortionGrams(' 30 ')).toEqual({ state: 'value', value: 30 })
  })

  it('separa vacio de invalido: sin clasificar no es un error', () => {
    expect(parsePortionGrams('')).toEqual({ state: 'empty' })
    expect(parsePortionGrams('   ')).toEqual({ state: 'empty' })
    expect(parsePortionGrams('abc')).toEqual({ state: 'invalid' })
    expect(parsePortionGrams('0')).toEqual({ state: 'invalid' })
    expect(parsePortionGrams('-5')).toEqual({ state: 'invalid' })
  })

  it('marca el tope del servidor como caso propio, no como "no es un numero"', () => {
    expect(parsePortionGrams('5000')).toEqual({ state: 'value', value: 5000 })
    expect(parsePortionGrams('5001')).toEqual({ state: 'too-big' })
  })
})

describe('resolveCurrentClassification', () => {
  it('mi fila de lista le gana a las columnas del alimento (rank coach 0 < legacy 3)', () => {
    const current = resolveCurrentClassification({
      columns: { groupId: GROUP_A, portionGrams: 30, portionLabel: 'rebanada' },
      ownRows: [{ groupId: GROUP_B, portionGrams: 45, portionLabel: null }],
    })
    expect(current).toEqual({
      groupId: GROUP_B,
      portionGrams: 45,
      portionLabel: null,
      origin: 'coach-list-row',
    })
  })

  it('sin fila propia manda la columna del alimento', () => {
    expect(
      resolveCurrentClassification({
        columns: { groupId: GROUP_A, portionGrams: 30, portionLabel: null },
        ownRows: [],
      }),
    ).toEqual({ groupId: GROUP_A, portionGrams: 30, portionLabel: null, origin: 'food-columns' })
  })

  it('sin nada devuelve null (alimento sin clasificar)', () => {
    expect(resolveCurrentClassification({ columns: null, ownRows: [] })).toBeNull()
  })
})

describe('draftFromClassification', () => {
  it('siembra el formulario con lo vigente', () => {
    const current: FoodClassification = {
      groupId: GROUP_A,
      portionGrams: 30,
      portionLabel: 'rebanada',
      origin: 'coach-list-row',
    }
    expect(draftFromClassification(current)).toEqual({ groupId: GROUP_A, grams: '30', label: 'rebanada' })
  })

  it('sin clasificacion arranca vacio', () => {
    expect(draftFromClassification(null)).toEqual(EMPTY_FOOD_CLASSIFICATION)
  })
})

describe('validateFoodClassificationDraft', () => {
  it('deja pasar el borrador vacio: "sin clasificar" es un estado legitimo', () => {
    expect(validateFoodClassificationDraft(EMPTY_FOOD_CLASSIFICATION)).toBeNull()
  })

  it('exige gramos cuando hay grupo (regla junto-o-nada del servidor)', () => {
    expect(validateFoodClassificationDraft({ groupId: GROUP_A, grams: '', label: '' })).toEqual({
      field: 'grams',
      message: 'Indica cuántos gramos equivalen a 1 porción.',
    })
  })

  it('exige grupo cuando hay gramos o medida casera', () => {
    expect(validateFoodClassificationDraft({ groupId: '', grams: '30', label: '' })).toEqual({
      field: 'group',
      message: 'Elige el grupo de porciones al que equivale este alimento.',
    })
    expect(validateFoodClassificationDraft({ groupId: '', grams: '', label: '1 taza' })).toEqual({
      field: 'group',
      message: 'Elige el grupo de porciones al que equivale este alimento.',
    })
  })

  it('rechaza gramos no numericos y fuera de rango con el tope del servidor', () => {
    expect(validateFoodClassificationDraft({ groupId: GROUP_A, grams: 'mucho', label: '' })).toEqual({
      field: 'grams',
      message: CLASSIFICATION_COPY.gramsInvalid,
    })
    expect(validateFoodClassificationDraft({ groupId: GROUP_A, grams: '5001', label: '' })).toEqual({
      field: 'grams',
      message: CLASSIFICATION_COPY.gramsTooBig,
    })
  })

  it('rechaza la medida casera mas larga que la columna', () => {
    expect(
      validateFoodClassificationDraft({ groupId: GROUP_A, grams: '30', label: 'x'.repeat(41) }),
    ).toEqual({ field: 'label', message: CLASSIFICATION_COPY.labelTooLong })
  })

  it('acepta el caso completo', () => {
    expect(
      validateFoodClassificationDraft({ groupId: GROUP_A, grams: '22,5', label: ' 1 taza ' }),
    ).toBeNull()
  })
})

describe('planFoodClassification — alimento propio', () => {
  it('clasifica con UN solo paso: la action ya escribe columnas y sincroniza la lista', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: true,
      current: null,
      draft: { groupId: GROUP_A, grams: '30', label: '1 rebanada' },
    })
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          kind: 'set-food-equivalence',
          foodId: FOOD,
          exchangeGroupId: GROUP_A,
          exchangePortionGrams: 30,
          exchangePortionLabel: '1 rebanada',
        },
      ],
    })
  })

  it('quitar la clasificacion manda el trio en null', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: true,
      current: { groupId: GROUP_A, portionGrams: 30, portionLabel: 'x', origin: 'food-columns' },
      draft: EMPTY_FOOD_CLASSIFICATION,
    })
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          kind: 'set-food-equivalence',
          foodId: FOOD,
          exchangeGroupId: null,
          exchangePortionGrams: null,
          exchangePortionLabel: null,
        },
      ],
    })
  })

  it('devuelve el problema en vez de pasos cuando el borrador no valida', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: true,
      current: null,
      draft: { groupId: GROUP_A, grams: '', label: '' },
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.issue.field).toBe('grams')
  })
})

describe('planFoodClassification — alimento que no es mio', () => {
  it('escribe MI fila de lista, sin tocar el catalogo', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: null,
      draft: { groupId: GROUP_A, grams: '45', label: '' },
    })
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          kind: 'save-list-entry',
          foodId: FOOD,
          exchangeGroupId: GROUP_A,
          portionGrams: 45,
          portionLabel: null,
        },
      ],
    })
  })

  it('reclasificar BORRA mi fila vieja antes de escribir la nueva', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: { groupId: GROUP_A, portionGrams: 30, portionLabel: null, origin: 'coach-list-row' },
      draft: { groupId: GROUP_B, grams: '45', label: '' },
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.steps).toEqual([
      { kind: 'clear-list-entry', foodId: FOOD, exchangeGroupId: GROUP_A },
      {
        kind: 'save-list-entry',
        foodId: FOOD,
        exchangeGroupId: GROUP_B,
        portionGrams: 45,
        portionLabel: null,
      },
    ])
  })

  it('tapa con LAPIDA el grupo que impone el catalogo (borrar mi fila no apaga la rama legacy)', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: { groupId: GROUP_A, portionGrams: 30, portionLabel: null, origin: 'food-columns' },
      catalogGroupId: GROUP_A,
      draft: { groupId: GROUP_B, grams: '45', label: '' },
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.steps).toEqual([
      { kind: 'exclude-list-entry', foodId: FOOD, exchangeGroupId: GROUP_A },
      {
        kind: 'save-list-entry',
        foodId: FOOD,
        exchangeGroupId: GROUP_B,
        portionGrams: 45,
        portionLabel: null,
      },
    ])
  })

  it('mi fila y la del catalogo en el MISMO grupo se retiran con un solo paso', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: { groupId: GROUP_A, portionGrams: 30, portionLabel: null, origin: 'coach-list-row' },
      catalogGroupId: GROUP_A,
      draft: EMPTY_FOOD_CLASSIFICATION,
    })
    expect(plan).toEqual({
      ok: true,
      steps: [{ kind: 'exclude-list-entry', foodId: FOOD, exchangeGroupId: GROUP_A }],
    })
  })

  it('mi fila en un grupo y el catalogo en otro: se retiran los dos', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: { groupId: GROUP_B, portionGrams: 45, portionLabel: null, origin: 'coach-list-row' },
      catalogGroupId: GROUP_A,
      draft: EMPTY_FOOD_CLASSIFICATION,
    })
    expect(plan).toEqual({
      ok: true,
      steps: [
        { kind: 'clear-list-entry', foodId: FOOD, exchangeGroupId: GROUP_B },
        { kind: 'exclude-list-entry', foodId: FOOD, exchangeGroupId: GROUP_A },
      ],
    })
  })

  it('guardar en el MISMO grupo del catalogo no genera lapida (no se retira de donde ya esta)', () => {
    const plan = planFoodClassification({
      foodId: FOOD,
      ownedByActor: false,
      current: { groupId: GROUP_A, portionGrams: 30, portionLabel: null, origin: 'food-columns' },
      catalogGroupId: GROUP_A,
      draft: { groupId: GROUP_A, grams: '35', label: '' },
    })
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          kind: 'save-list-entry',
          foodId: FOOD,
          exchangeGroupId: GROUP_A,
          portionGrams: 35,
          portionLabel: null,
        },
      ],
    })
  })
})

describe('hasClassificationChanges', () => {
  const current: FoodClassification = {
    groupId: GROUP_A,
    portionGrams: 30,
    portionLabel: 'rebanada',
    origin: 'coach-list-row',
  }

  it('el borrador recien sembrado no tiene cambios', () => {
    expect(hasClassificationChanges(current, draftFromClassification(current))).toBe(false)
  })

  it('normaliza coma decimal y espacios antes de comparar', () => {
    expect(hasClassificationChanges(current, { groupId: GROUP_A, grams: '30,0', label: ' rebanada ' })).toBe(
      false,
    )
  })

  it('detecta cambio de grupo, de gramos y de medida casera', () => {
    expect(hasClassificationChanges(current, { groupId: GROUP_B, grams: '30', label: 'rebanada' })).toBe(true)
    expect(hasClassificationChanges(current, { groupId: GROUP_A, grams: '35', label: 'rebanada' })).toBe(true)
    expect(hasClassificationChanges(current, { groupId: GROUP_A, grams: '30', label: '' })).toBe(true)
  })

  it('sin grupo destino solo importa el grupo: los otros campos no viajan', () => {
    expect(hasClassificationChanges(null, { groupId: '', grams: '30', label: '1 taza' })).toBe(false)
    expect(hasClassificationChanges(current, EMPTY_FOOD_CLASSIFICATION)).toBe(true)
  })
})

describe('classificationPreview', () => {
  it('solo se muestra con el par grupo+gramos completo', () => {
    expect(classificationPreview({ groupId: GROUP_A, grams: '', label: '' }, groups)).toBeNull()
    expect(classificationPreview({ groupId: '', grams: '30', label: '' }, groups)).toBeNull()
    expect(classificationPreview({ groupId: 'otro', grams: '30', label: '' }, groups)).toBeNull()
  })

  it('usa la tabla de microcopy canonica', () => {
    expect(classificationPreview({ groupId: GROUP_A, grams: '30', label: '' }, groups)).toBe(
      '1 porción de Cereales = 30 g',
    )
    expect(classificationPreview({ groupId: GROUP_A, grams: '22,5', label: ' 1 taza ' }, groups)).toBe(
      '1 porción de Cereales = 22.5 g (1 taza)',
    )
  })
})
