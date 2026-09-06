import { describe, expect, it } from 'vitest'
import { convertQuantityTextOnUnitChange, formatQuantityText } from './unit-change'

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

  it('la unidad `casera` de W2 todavia no convierte: conserva el numero', () => {
    expect(
      convertQuantityTextOnUnitChange({
        quantity: '2',
        fromUnit: 'casera',
        toUnit: 'g',
        food: { servingSize: 100, householdGrams: 61 },
      }),
    ).toBe('2')
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
