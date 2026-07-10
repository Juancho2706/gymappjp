/**
 * Barrel + composicion del dominio de composicion corporal (ISAK completo).
 *
 * `computeIsak` compone el fraccionamiento de 5 componentes (Kerr), el somatotipo (Heath-Carter)
 * y el % grasa (ecuacion seleccionable) en un unico `IsakResult` — lo que el service persiste en
 * `metrics`/`equation_used`. Todo PURO y determinista (sin IO, sin fechas).
 */

export * from './types'
export * from './phantom'
export * from './anthropometry'
export * from './somatotype'
export * from './bodyfat'

import { fractionate5C } from './anthropometry'
import { bodyFatPct } from './bodyfat'
import { heathCarter } from './somatotype'
import type { BodyFatEquation, IsakRawInput, IsakResult } from './types'

export interface ComputeIsakOptions {
  /** Ecuacion de % grasa por poblacion (default poblacion general adulta: Durnin-Womersley). */
  bodyFatEquation?: BodyFatEquation
}

/** Etiqueta de trazabilidad que se persiste en la columna `equation_used`. */
export function isakEquationLabel(bodyFatEquation: BodyFatEquation): string {
  return `kerr5c+heath_carter+${bodyFatEquation}`
}

/**
 * ISAK completo: fraccionamiento + somatotipo + % grasa. Es el MISMO codigo que corre en el
 * preview en vivo del cliente y en la persistencia server-side (paridad garantizada).
 */
export function computeIsak(raw: IsakRawInput, opts: ComputeIsakOptions = {}): IsakResult {
  const bodyFatEquation = opts.bodyFatEquation ?? 'durnin_womersley'
  return {
    fractionation: fractionate5C(raw),
    somatotype: heathCarter(raw),
    bodyFat: bodyFatPct(raw, bodyFatEquation),
    equationUsed: isakEquationLabel(bodyFatEquation),
  }
}
