import { describe, expect, it } from 'vitest'
import { convertQuantityTextOnUnitChange, formatQuantityText, householdRowShape } from './unit-change'

/**
 * W1.1 «Cantidades honestas»: el coach cambiaba la unidad y la cantidad se quedaba quieta. Con
 * "30" escrito y un salto de g a `un`, el plan salia publicado con 30 PORCIONES de 100 g — el
 * caso real de «Huevo revuelto 30 un» = 4.470 kcal (06-09).
 *
 * El invariante que estas pruebas cuidan es doble: cuando la conversion ES representable el
 * numero cambia con la MISMA formula que ya usa el alumno (`convertIntakeQuantity`), y cuando
 * NO lo es el texto vuelve INTACTO — nunca vaciado, nunca inventado (SPEC §4.1).
 */

/** Huevo del catalogo con porcion de 60 g. */
const HUEVO = { servingSize: 60 }

describe('convertQuantityTextOnUnitChange', () => {
  it('g → un divide por la porcion (100 g con porcion 60 ⇒ 1,7 un)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '100', fromUnit: 'g', toUnit: 'un', food: HUEVO }),
    ).toBe('1.7')
  })

  it('un → g multiplica por la porcion (1 un con porcion 60 ⇒ 60 g)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '1', fromUnit: 'un', toUnit: 'g', food: HUEVO }),
    ).toBe('60')
  })

  it('g ↔ ml conserva el numero (misma base per-100)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '200', fromUnit: 'g', toUnit: 'ml', food: HUEVO }),
    ).toBe('200')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '200', fromUnit: 'ml', toUnit: 'g', food: HUEVO }),
    ).toBe('200')
  })

  it('acepta los sinonimos de la UI historica ("unidad" es `un`)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '2', fromUnit: 'unidad', toUnit: 'gr', food: HUEVO }),
    ).toBe('120')
  })

  it('sin alimento del catalogo no toca el texto (no hay porcion con que convertir)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '30', fromUnit: 'g', toUnit: 'un', food: null }),
    ).toBe('30')
  })

  it('la unidad heredada `porción` conserva el numero (no tiene equivalencia en g/un)', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '2', fromUnit: 'porción', toUnit: 'g', food: HUEVO }),
    ).toBe('2')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '2', fromUnit: 'g', toUnit: 'porción', food: HUEVO }),
    ).toBe('2')
  })

  it('sin `servingSize` utilizable conserva el numero', () => {
    expect(
      convertQuantityTextOnUnitChange({
        quantity: '100',
        fromUnit: 'g',
        toUnit: 'un',
        food: { servingSize: null },
      }),
    ).toBe('100')
    expect(
      convertQuantityTextOnUnitChange({
        quantity: '100',
        fromUnit: 'g',
        toUnit: 'un',
        food: { servingSize: 0 },
      }),
    ).toBe('100')
  })

  it('texto no numerico y cantidad 0 vuelven intactos', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: 'dos', fromUnit: 'g', toUnit: 'un', food: HUEVO }),
    ).toBe('dos')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '', fromUnit: 'g', toUnit: 'un', food: HUEVO }),
    ).toBe('')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '0', fromUnit: 'g', toUnit: 'un', food: HUEVO }),
    ).toBe('0')
  })

  it('la misma unidad (o un sinonimo suyo) es un no-op literal', () => {
    expect(
      convertQuantityTextOnUnitChange({ quantity: '100.5', fromUnit: 'g', toUnit: 'g', food: HUEVO }),
    ).toBe('100.5')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '100.5', fromUnit: 'gr', toUnit: 'g', food: HUEVO }),
    ).toBe('100.5')
  })

  it('W2: `casera` ↔ g convierte por el gramaje de la medida (b8, ya cableado)', () => {
    const huevo = { servingSize: 100, householdGrams: 61 }
    expect(
      convertQuantityTextOnUnitChange({ quantity: '2', fromUnit: 'casera', toUnit: 'g', food: huevo }),
    ).toBe('122')
    expect(
      convertQuantityTextOnUnitChange({ quantity: '122', fromUnit: 'g', toUnit: 'casera', food: huevo }),
    ).toBe('2')
  })

  it('W2: sin gramaje casero el numero vuelve intacto (nunca se inventa la medida)', () => {
    expect(
      convertQuantityTextOnUnitChange({
        quantity: '122',
        fromUnit: 'g',
        toUnit: 'casera',
        food: { servingSize: 100, householdGrams: null },
      }),
    ).toBe('122')
  })

  it('una conversion que redondearia a 0 conserva el numero (nunca borra el item)', () => {
    // 1 g con porcion de 100 g ⇒ 0,01 un ⇒ redondeo a 0: mejor "1" que un item en cero.
    expect(
      convertQuantityTextOnUnitChange({
        quantity: '1',
        fromUnit: 'g',
        toUnit: 'un',
        food: { servingSize: 100 },
      }),
    ).toBe('1')
  })
})

describe('formatQuantityText', () => {
  it('un decimal, punto como separador (misma convencion que el stepper del editor)', () => {
    expect(formatQuantityText(1.666)).toBe('1.7')
    expect(formatQuantityText(60)).toBe('60')
    expect(formatQuantityText(0.5)).toBe('0.5')
  })
})

/**
 * W2 — hidratacion de una fila de los WIZARDS (que no tienen par propio en el item): el plan
 * guarda «122 g» + la medida congelada y el coach tiene que ver «2 huevos».
 */
describe('householdRowShape', () => {
  const huevo = { householdGrams: 61, householdLabel: 'huevo', servingUnit: 'g', hasFood: true }

  it('rehidrata la cuenta desde los gramos, redondeada al medio', () => {
    expect(householdRowShape({ ...huevo, unit: 'g', quantity: 122 })).toEqual({
      unit: 'casera',
      quantity: '2',
      pair: { grams: 61, label: 'huevo' },
    })
    // 92 g / 61 = 1,508… ⇒ 1,5 huevos (el paso del stepper en casera).
    expect(householdRowShape({ ...huevo, unit: 'g', quantity: 92 }).quantity).toBe('1.5')
  })

  it('una fila que YA viene en casera no se vuelve a dividir', () => {
    expect(householdRowShape({ ...huevo, unit: 'casera', quantity: 2 })).toEqual({
      unit: 'casera',
      quantity: '2',
      pair: { grams: 61, label: 'huevo' },
    })
  })

  it('sin par utilizable la fila se queda en su magnitud, con el numero intacto', () => {
    expect(householdRowShape({ ...huevo, householdGrams: null, unit: 'g', quantity: 122 })).toEqual({
      unit: 'g',
      quantity: '122',
      pair: null,
    })
    expect(householdRowShape({ ...huevo, householdLabel: ' ', unit: 'casera', quantity: 2 })).toEqual({
      unit: 'g',
      quantity: '2',
      pair: null,
    })
  })

  it('sin alimento resuelto una fila casera baja a gramos honestos (no queda irresoluble)', () => {
    expect(householdRowShape({ ...huevo, hasFood: false, unit: 'casera', quantity: 2 })).toEqual({
      unit: 'g',
      quantity: '122',
      pair: null,
    })
  })

  it('un gramaje mayor que la cantidad no borra el item: se queda en gramos', () => {
    // 20 g con una medida de 240 g ⇒ 0,08 ⇒ redondeo a 0: mejor «20 g» que un item en cero.
    expect(
      householdRowShape({ householdGrams: 240, householdLabel: 'taza', servingUnit: 'g', hasFood: true, unit: 'g', quantity: 20 }),
    ).toEqual({ unit: 'g', quantity: '20', pair: { grams: 240, label: 'taza' } })
  })

  it('la magnitud de un liquido es ml (no se baja a gramos un jugo)', () => {
    expect(
      householdRowShape({
        householdGrams: null,
        householdLabel: null,
        servingUnit: 'ml',
        hasFood: true,
        unit: 'casera',
        quantity: 2,
      }).unit,
    ).toBe('ml')
  })
})
