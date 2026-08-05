import { describe, it, expect } from 'vitest'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  canAddFoodPickerItem,
  foodPickerGroupOf,
  foodPickerRestrictionIndex,
  foodPickerRestrictionState,
  groupFoodPickerResults,
} from './food-picker-grouping'

const COACH_ID = '00000000-0000-4000-8000-00000000c0ac'
const OTHER_COACH_ID = '00000000-0000-4000-8000-00000000beef'

function makeItem(overrides: Partial<FoodCatalogItem> = {}): FoodCatalogItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    catalogKey: null,
    gtin: null,
    name: 'Arroz',
    brand: null,
    category: 'cereal',
    countryCode: 'CL',
    servingSize: 100,
    servingUnit: 'g',
    calories: 130,
    proteinG: 2.7,
    carbsG: 28,
    fatsG: 0.3,
    fiberG: 0.4,
    sodiumMg: 1,
    sugarG: 0.1,
    saturatedFatG: 0.1,
    packageQuantity: null,
    packageUnit: null,
    source: 'eva',
    sourceRef: null,
    verificationStatus: 'eva_verified',
    coachId: null,
    orgId: null,
    media: null,
    ...overrides,
  }
}

describe('foodPickerGroupOf', () => {
  it('manda al historial cualquier alimento que el alumno ya consumio, aunque sea propio o de marca', () => {
    const own = makeItem({ id: 'a', coachId: COACH_ID })
    const branded = makeItem({ id: 'b', source: 'open_food_facts', gtin: '7801234567894' })
    const recentIds = new Set(['a', 'b'])

    expect(foodPickerGroupOf(own, { recentIds, viewerCoachId: COACH_ID })).toBe('history')
    expect(foodPickerGroupOf(branded, { recentIds, viewerCoachId: COACH_ID })).toBe('history')
  })

  it('separa "Mis alimentos" por coachId del viewer, no por source', () => {
    const mine = makeItem({ coachId: COACH_ID, source: 'coach' })
    const fromOtherCoach = makeItem({ coachId: OTHER_COACH_ID, source: 'coach' })

    expect(foodPickerGroupOf(mine, { viewerCoachId: COACH_ID })).toBe('mine')
    expect(foodPickerGroupOf(fromOtherCoach, { viewerCoachId: COACH_ID })).toBe('catalog')
  })

  it('sin viewerCoachId no inventa "Mis alimentos"', () => {
    expect(foodPickerGroupOf(makeItem({ coachId: COACH_ID }), {})).toBe('catalog')
  })

  it('marca como "Con marca" lo de OFF/USDA y todo lo que traiga GTIN', () => {
    expect(foodPickerGroupOf(makeItem({ source: 'open_food_facts' }))).toBe('branded')
    expect(foodPickerGroupOf(makeItem({ source: 'usda' }))).toBe('branded')
    expect(foodPickerGroupOf(makeItem({ source: 'import', gtin: '7801234567894' }))).toBe('branded')
  })

  it('deja en "Catálogo" lo global sin marca (eva, import, otros)', () => {
    expect(foodPickerGroupOf(makeItem({ source: 'eva' }))).toBe('catalog')
    expect(foodPickerGroupOf(makeItem({ source: 'import' }))).toBe('catalog')
    expect(foodPickerGroupOf(makeItem({ source: 'otra_fuente' }))).toBe('catalog')
  })
})

describe('groupFoodPickerResults', () => {
  const items = [
    makeItem({ id: 'branded', source: 'open_food_facts', gtin: '7801234567894' }),
    makeItem({ id: 'catalog', source: 'eva' }),
    makeItem({ id: 'mine', coachId: COACH_ID, source: 'coach' }),
    makeItem({ id: 'recent', source: 'eva' }),
  ]

  it('ordena historial > mios > catálogo > con marca, con "Con marca" siempre al final', () => {
    const groups = groupFoodPickerResults(items, {
      recentIds: new Set(['recent']),
      viewerCoachId: COACH_ID,
      clientName: 'Ana',
    })
    expect(groups.map((group) => group.id)).toEqual(['history', 'mine', 'catalog', 'branded'])
    expect(groups[0]?.title).toBe('Del historial de Ana')
    expect(groups[3]?.title).toBe('Con marca')
  })

  it('omite los grupos vacios y no duplica items', () => {
    const groups = groupFoodPickerResults([makeItem({ id: 'solo', source: 'eva' })], {
      viewerCoachId: COACH_ID,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]?.id).toBe('catalog')
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(['solo'])
  })

  it('conserva el orden de relevancia de la busqueda dentro de cada grupo', () => {
    const groups = groupFoodPickerResults(
      [
        makeItem({ id: 'c1', source: 'eva' }),
        makeItem({ id: 'm1', coachId: COACH_ID }),
        makeItem({ id: 'c2', source: 'eva' }),
      ],
      { viewerCoachId: COACH_ID },
    )
    const catalog = groups.find((group) => group.id === 'catalog')
    expect(catalog?.items.map((item) => item.id)).toEqual(['c1', 'c2'])
  })

  it('sin alumno el historial usa un titulo generico', () => {
    const groups = groupFoodPickerResults([makeItem({ id: 'r' })], { recentIds: new Set(['r']) })
    expect(groups[0]?.title).toBe('Del historial del alumno')
  })
})

describe('gate de alergia', () => {
  const index = foodPickerRestrictionIndex([
    { foodId: 'nuez', kind: 'allergy' },
    { foodId: 'leche', kind: 'intolerance' },
    { foodId: 'brocoli', kind: 'dislike' },
  ])

  it('bloquea SOLO la alergia', () => {
    expect(foodPickerRestrictionState('nuez', index)).toEqual({
      blocked: true,
      kind: 'allergy',
      label: 'Alergia declarada',
      tone: 'danger',
    })
    expect(foodPickerRestrictionState('leche', index).blocked).toBe(false)
    expect(foodPickerRestrictionState('brocoli', index).blocked).toBe(false)
  })

  it('avisa en ambar intolerancia y disgusto', () => {
    expect(foodPickerRestrictionState('leche', index).tone).toBe('warning')
    expect(foodPickerRestrictionState('leche', index).label).toBe('Intolerancia declarada')
    expect(foodPickerRestrictionState('brocoli', index).tone).toBe('warning')
    expect(foodPickerRestrictionState('brocoli', index).label).toBe('No le gusta')
  })

  it('un alimento sin restriccion no muestra nada', () => {
    expect(foodPickerRestrictionState('arroz', index)).toEqual({
      blocked: false,
      kind: null,
      label: null,
      tone: null,
    })
    expect(foodPickerRestrictionState('arroz', null)).toEqual({
      blocked: false,
      kind: null,
      label: null,
      tone: null,
    })
  })

  it('la alergia gana sobre otra declaracion del mismo alimento, en cualquier orden', () => {
    const first = foodPickerRestrictionIndex([
      { foodId: 'nuez', kind: 'dislike' },
      { foodId: 'nuez', kind: 'allergy' },
    ])
    const second = foodPickerRestrictionIndex([
      { foodId: 'nuez', kind: 'allergy' },
      { foodId: 'nuez', kind: 'dislike' },
    ])
    expect(first.get('nuez')).toBe('allergy')
    expect(second.get('nuez')).toBe('allergy')
  })

  it('solo el override explicito habilita agregar un alergeno', () => {
    const allergy = foodPickerRestrictionState('nuez', index)
    expect(canAddFoodPickerItem(allergy, false)).toBe(false)
    expect(canAddFoodPickerItem(allergy, true)).toBe(true)

    const intolerance = foodPickerRestrictionState('leche', index)
    expect(canAddFoodPickerItem(intolerance, false)).toBe(true)
  })
})
