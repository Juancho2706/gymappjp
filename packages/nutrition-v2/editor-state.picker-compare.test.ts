import { describe, expect, it } from 'vitest'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  catalogToPortionGroups,
  collectPortionGroups,
  comparePickerGroups,
  type NutritionPlanReadModel,
  type QePortionGroup,
} from './index'

/** Grupo del picker minimo: solo lo que el comparador mira. */
function pickerGroup(
  groupCode: string,
  extra: { sortOrder?: number; legacy?: boolean } = {},
): QePortionGroup & { sortOrder?: number; legacy?: boolean } {
  return {
    exchangeGroupId: `id-${groupCode}`,
    groupCode,
    groupName: groupCode,
    color: null,
    ref: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
    composedOf: null,
    macrosConfirmed: true,
    ...extra,
  }
}

describe('comparePickerGroups — orden del picker de porciones (R17, DATA §7.2 caso 15)', () => {
  it('el no legado va antes que el legado, sin importar el sortOrder', () => {
    const legado = pickerGroup('C', { sortOrder: 10, legacy: true })
    const propio = pickerGroup('PCT', { sortOrder: 330, legacy: false })
    expect([legado, propio].sort(comparePickerGroups).map((g) => g.groupCode)).toEqual(['PCT', 'C'])
  })

  it('el grupo SIN sortOrder queda al final del bloque (los del plan no lo traen)', () => {
    const sinOrden = pickerGroup('LD')
    const conOrden = pickerGroup('SCP', { sortOrder: 330 })
    expect([sinOrden, conOrden].sort(comparePickerGroups).map((g) => g.groupCode)).toEqual([
      'SCP',
      'LD',
    ])
  })

  it('empate de sortOrder ⇒ desempata por groupCode', () => {
    const b = pickerGroup('VG', { sortOrder: 210 })
    const a = pickerGroup('AG', { sortOrder: 210 })
    expect([b, a].sort(comparePickerGroups).map((g) => g.groupCode)).toEqual(['AG', 'VG'])
  })

  it('empate SIN sortOrder en ninguno de los dos ⇒ tambien desempata por groupCode', () => {
    const z = pickerGroup('VL')
    const a = pickerGroup('AZ')
    expect([z, a].sort(comparePickerGroups).map((g) => g.groupCode)).toEqual(['AZ', 'VL'])
  })

  it('orden completo: propios por sortOrder, legado al final', () => {
    const entrada = [
      pickerGroup('LAC', { sortOrder: 50, legacy: true }),
      pickerGroup('PCT', { sortOrder: 330 }),
      pickerGroup('LD', { sortOrder: 210 }),
      pickerGroup('MIO'), // custom del coach recien agregado, sin sortOrder
      pickerGroup('C', { sortOrder: 10, legacy: true }),
    ]
    expect([...entrada].sort(comparePickerGroups).map((g) => g.groupCode)).toEqual([
      'LD',
      'PCT',
      'MIO',
      'C',
      'LAC',
    ])
  })
})

describe('portionSystem en los grupos del picker (R18)', () => {
  function catalogGroup(overrides: Partial<ExchangeGroup> & { id: string; code: string }): ExchangeGroup {
    return {
      slug: overrides.code.toLowerCase(),
      name: overrides.code,
      coachId: null,
      teamId: null,
      isSystem: true,
      refCalories: 0,
      refProteinG: 0,
      refCarbsG: 0,
      refFatsG: 0,
      color: null,
      sortOrder: 0,
      composedOf: null,
      macrosConfirmed: true,
      ...overrides,
    }
  }

  it('catalogToPortionGroups PROPAGA el portionSystem del catalogo vivo', () => {
    const groups = catalogToPortionGroups([
      catalogGroup({ id: 'g-pct', code: 'PCT', sortOrder: 330, portionSystem: 'cl' }),
      catalogGroup({ id: 'g-c', code: 'C', sortOrder: 10, portionSystem: 'smae' }),
      catalogGroup({ id: 'g-mio', code: 'MIO', sortOrder: 400, isSystem: false }),
    ])
    const byCode = new Map(groups.map((g) => [g.groupCode, g]))
    expect(byCode.get('PCT')?.portionSystem).toBe('cl')
    expect(byCode.get('C')?.portionSystem).toBe('smae')
    // El custom sin columna viaja `undefined`: el borde lo resuelve con `systemOf`.
    expect(byCode.get('MIO')?.portionSystem).toBeUndefined()
  })

  it('collectPortionGroups deja portionSystem undefined: el snapshot no guarda el set', () => {
    const planModel = {
      dayVariants: [
        {
          mealSlots: [
            {
              exchangeTargets: [
                {
                  exchangeGroupId: 'id-pct',
                  groupCode: 'PCT',
                  groupName: 'Panes, cereales y tuberculos',
                  color: null,
                  ref: { calories: 140, proteinG: 3, carbsG: 30, fatsG: 1 },
                  composedOf: null,
                  macrosConfirmed: true,
                },
              ],
            },
          ],
        },
      ],
    } as unknown as NutritionPlanReadModel

    const [grupo] = collectPortionGroups(planModel)
    expect(grupo.groupCode).toBe('PCT')
    expect(grupo.portionSystem).toBeUndefined()
    expect('portionSystem' in grupo).toBe(false)
  })
})
