import { describe, expect, it } from 'vitest'
import { type QuantityLabelInput, formatItemQuantity, formatUnitLabel } from './quantity-format'

/**
 * W2.3 «Cantidades honestas» (SPEC §5.5): rotulo unico de cantidad+unidad, con o sin medida
 * casera congelada en el item. Tabla en vez de tests sueltos: son puros y muchos, la tabla hace
 * evidente que borde cubre cada fila (mismo estilo que plausibility.test.ts).
 */

describe('formatUnitLabel', () => {
  const cases: { label: string; unit: string | null | undefined; quantity: number | undefined; expected: string }[] = [
    { label: 'un queda un (codigo corto, no "unidad")', unit: 'un', quantity: 3, expected: 'un' },
    { label: 'g queda g', unit: 'g', quantity: 200, expected: 'g' },
    { label: 'ml queda ml', unit: 'ml', quantity: 250, expected: 'ml' },
    { label: 'porcion singular', unit: 'porción', quantity: 1, expected: 'porción' },
    { label: 'porcion plural', unit: 'porción', quantity: 2, expected: 'porciones' },
    { label: 'porcion sin quantity explicito ⇒ default singular', unit: 'porción', quantity: undefined, expected: 'porción' },
    { label: 'unit null ⇒ vacio', unit: null, quantity: 1, expected: '' },
    { label: 'unit undefined ⇒ vacio', unit: undefined, quantity: 1, expected: '' },
    { label: 'unit vacio/whitespace ⇒ vacio', unit: '   ', quantity: 1, expected: '' },
  ]

  it.each(cases)('$label', ({ unit, quantity, expected }) => {
    expect(quantity === undefined ? formatUnitLabel(unit) : formatUnitLabel(unit, quantity)).toBe(expected)
  })
})

describe('formatItemQuantity', () => {
  const cases: { label: string; input: QuantityLabelInput; expected: string }[] = [
    {
      label: 'sin par casero, unidad un ⇒ "3 un"',
      input: { quantity: 3, unit: 'un' },
      expected: '3 un',
    },
    {
      label: 'sin par casero, gramos ⇒ "200 g"',
      input: { quantity: 200, unit: 'g' },
      expected: '200 g',
    },
    {
      label: 'sin par casero, porcion singular ⇒ "1 porción"',
      input: { quantity: 1, unit: 'porción' },
      expected: '1 porción',
    },
    {
      label: 'sin par casero, porcion plural ⇒ "2 porciones"',
      input: { quantity: 2, unit: 'porción' },
      expected: '2 porciones',
    },
    {
      label: 'con par casero entero, gramos ⇒ "2 huevos (122 g)"',
      input: { quantity: 122, unit: 'g', householdLabel: 'huevo', householdGrams: 61 },
      expected: '2 huevos (122 g)',
    },
    {
      label: 'con par casero fraccion comun, ml ⇒ "½ taza (60 ml)"',
      input: { quantity: 60, unit: 'ml', householdLabel: 'taza', householdGrams: 120 },
      expected: '½ taza (60 ml)',
    },
    {
      // `formatHouseholdCount` (packages/nutrition-engine/micros.ts) formatea la CUENTA casera
      // con `Intl.NumberFormat('es-CL', ...)` (mejora del jefe 06-09): coma decimal, no punto.
      label: 'con par casero, cuenta con decimal ⇒ "1,5 huevos (91,5 g)"',
      input: { quantity: 91.5, unit: 'g', householdLabel: 'huevo', householdGrams: 61 },
      expected: '1,5 huevos (91,5 g)',
    },
    {
      label: 'cantidad 0 con par casero ⇒ cuenta rara, cae a "0 g"',
      input: { quantity: 0, unit: 'g', householdLabel: 'huevo', householdGrams: 61 },
      expected: '0 g',
    },
    {
      label: 'cantidad 0 sin par casero ⇒ "0 g"',
      input: { quantity: 0, unit: 'g' },
      expected: '0 g',
    },
    {
      label: 'unit null ⇒ solo el numero, sin espacio colgando',
      input: { quantity: 5, unit: null },
      expected: '5',
    },
    {
      label: 'unit undefined ⇒ solo el numero',
      input: { quantity: 5, unit: undefined },
      expected: '5',
    },
    {
      label: 'householdGrams fuera de rango (>1000) ⇒ ignora el par, gramos planos',
      input: { quantity: 500, unit: 'g', householdLabel: 'bolsa', householdGrams: 5000 },
      expected: '500 g',
    },
    {
      label: 'householdLabel vacio ⇒ ignora el par',
      input: { quantity: 200, unit: 'g', householdLabel: '   ', householdGrams: 100 },
      expected: '200 g',
    },
    {
      label: 'unit un con par casero NO aplica (solo g/ml) ⇒ "3 un" plano',
      input: { quantity: 3, unit: 'un', householdLabel: 'huevo', householdGrams: 61 },
      expected: '3 un',
    },
    {
      label: 'unit casera (solo borrador) con par ⇒ cuenta casera SIN parentesis',
      input: { quantity: 2, unit: 'casera', householdLabel: 'huevo', householdGrams: 61 },
      expected: '2 huevos',
    },
    {
      label: 'unit casera con cuenta fraccionaria ⇒ fraccion comun sin parentesis',
      input: { quantity: 0.5, unit: 'casera', householdLabel: 'taza', householdGrams: 120 },
      expected: '½ taza',
    },
    {
      label: 'unit casera sin par (medida aun no resuelta) ⇒ "{quantity} un"',
      input: { quantity: 3, unit: 'casera' },
      expected: '3 un',
    },
  ]

  it.each(cases)('$label', ({ input, expected }) => {
    expect(formatItemQuantity(input)).toBe(expected)
  })
})
