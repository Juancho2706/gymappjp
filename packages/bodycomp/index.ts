/**
 * @eva/bodycomp — dominio PURO de composicion corporal (BIA + ISAK completo).
 *
 * Fuente de verdad unica reutilizada por web (@eva/web) y mobile (apps/mobile). TypeScript puro:
 * sin React / Next / Supabase / React Native. Extraido desde apps/web/src/domain/bodycomp en E6-01
 * (specs/rn-mobile-parity-redesign) para que web y mobile compartan el calculo ISAK sin drift.
 *
 * `computeIsak` compone el fraccionamiento de 5 componentes (Kerr), el somatotipo (Heath-Carter)
 * y el % grasa (ecuacion seleccionable) en un unico `IsakResult` — lo que el service persiste en
 * `metrics`/`equation_used`. Es el MISMO codigo que corre en el preview en vivo del cliente y en la
 * persistencia server-side (paridad garantizada). Todo PURO y determinista (sin IO, sin fechas).
 *
 * BIA no calcula: `BiaMetrics` (en ./types) es el superset opcional del reporte del dispositivo.
 *
 * `./dto` exporta los TIPOS espejo del payload de creacion (BIA/ISAK) que mobile tipa sin arrastrar
 * los schemas Zod server de `@eva/schemas/bodycomp` (que no es importable en mobile — ver ./dto).
 */

export * from './types'
export * from './phantom'
export * from './anthropometry'
export * from './somatotype'
export * from './bodyfat'
export * from './dto'

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
