import { describe, expect, it } from 'vitest'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  applyCatalogMetaToPickerGroups,
  comparePickerGroups,
  type QePortionGroup,
} from './index'

/**
 * Grupo tal como sale del PLAN (`collectPortionGroups`): con su snapshot congelado y SIN
 * `portionSystem` (R18). El `ref`/`composedOf`/`groupName` de aca son los que tienen que
 * sobrevivir al overlay.
 */
function planGroup(groupCode: string, extra: Partial<QePortionGroup> = {}): QePortionGroup {
  return {
    exchangeGroupId: `id-${groupCode}`,
    groupCode,
    groupName: `Nombre congelado ${groupCode}`,
    color: '#111111',
    ref: { calories: 80, proteinG: 2, carbsG: 15, fatsG: 0 },
    composedOf: null,
    macrosConfirmed: true,
    ...extra,
  }
}

/** Grupo del catalogo VIVO, que si trae `portionSystem`, `sortOrder` e `isSystem`. */
function catalogGroup(
  groupCode: string,
  extra: Partial<ExchangeGroup> = {},
): ExchangeGroup {
  return {
    id: `id-${groupCode}`,
    slug: `slug-${groupCode}`,
    code: groupCode,
    name: `Nombre vivo ${groupCode}`,
    coachId: null,
    teamId: null,
    isSystem: true,
    refCalories: 999,
    refProteinG: 99,
    refCarbsG: 99,
    refFatsG: 99,
    color: '#ff0000',
    sortOrder: 100,
    composedOf: null,
    macrosConfirmed: false,
    ...extra,
  }
}

describe('applyCatalogMetaToPickerGroups — overlay de metadatos del catalogo (R17/R18)', () => {
  it('pega portionSystem, sortOrder e isSystem al grupo del plan sin tocar su snapshot', () => {
    const delPlan = planGroup('C', {
      composedOf: [{ code: 'P', portions: 1, ref: { calories: 55, proteinG: 7, carbsG: 0, fatsG: 3 } }],
    })
    const [salida] = applyCatalogMetaToPickerGroups(
      [delPlan],
      [catalogGroup('C', { portionSystem: 'smae', sortOrder: 20, isSystem: true })],
    )

    expect(salida.portionSystem).toBe('smae')
    expect(salida.sortOrder).toBe(20)
    expect(salida.isSystem).toBe(true)
    // El snapshot del plan gana: nombre, color, refs y composicion intactos.
    expect(salida.groupName).toBe('Nombre congelado C')
    expect(salida.color).toBe('#111111')
    expect(salida.ref).toEqual(delPlan.ref)
    expect(salida.composedOf).toEqual(delPlan.composedOf)
    expect(salida.macrosConfirmed).toBe(true)
  })

  it('NO muta la entrada: devuelve copias y el grupo del plan sigue sin metadatos', () => {
    // El overlay corre en el render del picker, sobre la MISMA lista que el consumidor
    // memoiza. Si mutara en el lugar, `portionSystem` y `sortOrder` se quedarian pegados al
    // grupo del plan y el segundo render pintaria un set que el snapshot nunca guardo (R18).
    const entrada = [planGroup('C'), planGroup('LD')]
    const salida = applyCatalogMetaToPickerGroups(entrada, [
      catalogGroup('C', { portionSystem: 'smae', sortOrder: 20, isSystem: true }),
    ])

    expect(salida[0]).not.toBe(entrada[0])
    expect(salida[1]).not.toBe(entrada[1])
    expect(entrada[0].portionSystem).toBeUndefined()
    expect(entrada[1].portionSystem).toBeUndefined()
    // `sortOrder` e `isSystem` ni siquiera existen en `QePortionGroup`: el overlay los suma
    // en la copia, jamas en el original.
    expect(entrada[0]).not.toHaveProperty('sortOrder')
    expect(entrada[0]).not.toHaveProperty('isSystem')
    expect(salida[0].sortOrder).toBe(20)
  })

  it('catalogo null ⇒ la entrada sale igual y portionSystem sigue undefined (nadie inventa smae)', () => {
    const entrada = [planGroup('C'), planGroup('P')]
    const salida = applyCatalogMetaToPickerGroups(entrada, null)

    expect(salida).toEqual(entrada)
    // Sin catalogo tambien COPIA: la salida no comparte objetos con la entrada.
    expect(salida[0]).not.toBe(entrada[0])
    expect(salida[0].portionSystem).toBeUndefined()
    expect(salida[0].sortOrder).toBeUndefined()
    expect(salida[0].isSystem).toBeUndefined()
  })

  it('catalogo vacio ⇒ idem: sin cambio', () => {
    const entrada = [planGroup('C')]
    const salida = applyCatalogMetaToPickerGroups(entrada, [])

    expect(salida).toEqual(entrada)
    expect(salida[0].portionSystem).toBeUndefined()
  })

  it('id ausente del catalogo ⇒ ese grupo viaja sin cambio', () => {
    const [conMeta, sinMeta] = applyCatalogMetaToPickerGroups(
      [planGroup('C'), planGroup('LD')],
      [catalogGroup('C', { portionSystem: 'cl', sortOrder: 210, isSystem: true })],
    )

    expect(conMeta.sortOrder).toBe(210)
    expect(sinMeta.sortOrder).toBeUndefined()
    expect(sinMeta.portionSystem).toBeUndefined()
    expect(sinMeta.groupName).toBe('Nombre congelado LD')
  })

  it('preserva el orden de entrada (es la lista que ya devolvio mergePortionGroupChoices)', () => {
    const entrada = [planGroup('PCT'), planGroup('AG'), planGroup('CB')]
    const salida = applyCatalogMetaToPickerGroups(entrada, [
      catalogGroup('AG', { sortOrder: 300 }),
      catalogGroup('CB', { sortOrder: 220 }),
      catalogGroup('PCT', { sortOrder: 210 }),
    ])

    expect(salida.map((group) => group.groupCode)).toEqual(['PCT', 'AG', 'CB'])
  })

  it('grupo PROPIO con codigo C ⇒ isSystem false (no se infiere por codigo)', () => {
    const [salida] = applyCatalogMetaToPickerGroups(
      [planGroup('C')],
      [catalogGroup('C', { isSystem: false, coachId: 'coach-1', sortOrder: 500 })],
    )

    expect(salida.isSystem).toBe(false)
    expect(salida.sortOrder).toBe(500)
  })

  it('con el overlay, comparePickerGroups ordena por el catalogo y NO alfabetico', () => {
    // Sin overlay los tres empatan en sortOrder y el picker cae al alfabetico AG, CB, PCT.
    const entrada = [planGroup('AG'), planGroup('CB'), planGroup('PCT')]
    expect([...entrada].sort(comparePickerGroups).map((group) => group.groupCode)).toEqual([
      'AG',
      'CB',
      'PCT',
    ])

    const conMeta = applyCatalogMetaToPickerGroups(entrada, [
      catalogGroup('PCT', { sortOrder: 210 }),
      catalogGroup('CB', { sortOrder: 220 }),
      catalogGroup('AG', { sortOrder: 300 }),
    ])
    expect(conMeta.sort(comparePickerGroups).map((group) => group.groupCode)).toEqual([
      'PCT',
      'CB',
      'AG',
    ])
  })
})
