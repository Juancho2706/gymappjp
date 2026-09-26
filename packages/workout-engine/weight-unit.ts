/**
 * Unidad de PESO de captura y de lectura: kilos o libras (tren «kg-lb-ejecutor», SPEC R1–R3/R7).
 *
 * Regla dura del tren: `workout_logs.weight_kg` (y `workout_blocks.target_weight_kg`) son SIEMPRE
 * kilos — los leen ~140 archivos y 8 RPC (récords, tonelaje, volumen, dossier). La libra existe solo
 * en la ENTRADA (lo que el alumno tipea) y en la LECTURA (lo que el alumno ve). Este módulo es la
 * única conversión: la usa el payload (`set-log-payload.ts`, tipeado → kg) y el formateador
 * `formatLoggedWeight` (`logged-set-summary.ts`, kg → texto en la unidad pedida).
 *
 * Mismo patrón que la distancia en km (`distanceCaptureToMeters` de `cardio-modality.ts`): la caja
 * captura en la unidad del contexto y la columna guarda la unidad canónica.
 *
 * Precisión: `weight_kg` es `numeric(6,2)`. Una libra tipeada se guarda redondeada a centésimas de kg
 * y vuelve a libras redondeada a décimas; el error máximo del viaje es 0,011 lb, así que 45 lb vuelve
 * a mostrarse como 45 lb (tests de ida y vuelta en `weight-unit.test.ts`).
 *
 * Sin `Intl` (Hermes) y sin dependencias: TypeScript puro, igual que el resto del motor.
 */

/** Unidades de peso que el alumno puede elegir. `workout_blocks.load_unit` además admite `sec`. */
export const WEIGHT_UNITS = ['kg', 'lb'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

/** Definición exacta de la libra internacional. */
export const KG_PER_LB = 0.45359237

/** `true` solo para `'kg'` / `'lb'` (`sec`, null o basura no son una unidad de peso). */
export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'kg' || value === 'lb'
}

/**
 * Normaliza cualquier valor a una unidad de peso. Todo lo que no sea `'lb'` es kilos: una serie
 * encolada antes del tren (sin unidad) se tipeó con la etiqueta «Kg» y se trata como tal (R7).
 */
export function normalizeWeightUnit(value: unknown): WeightUnit {
  return value === 'lb' ? 'lb' : 'kg'
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/**
 * Peso TIPEADO en `unit` → kilos para la columna. En `kg` devuelve el número tal cual (el camino de
 * hoy no redondea y no se toca); en `lb` redondea a centésimas, la precisión de `numeric(6,2)`.
 */
export function weightToKg(value: number, unit: WeightUnit): number {
  if (unit === 'kg') return value
  return roundTo(value * KG_PER_LB, 2)
}

/** Kilos de la columna → número en `unit` para mostrar. En `lb` redondea a décimas. */
export function weightFromKg(kg: number, unit: WeightUnit): number {
  if (unit === 'kg') return kg
  return roundTo(kg / KG_PER_LB, 1)
}

/**
 * Convierte el número que el alumno ya tiene escrito cuando cambia el selector (R1: «cambiarla no
 * borra lo tecleado: lo convierte»). kg → lb a décimas (20 kg → 44,1 lb); lb → kg a centésimas
 * (50 lb → 22,68 kg), que es lo que acepta el teclado (`KEYPAD_MAX_DECIMALS`).
 */
export function convertTypedWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return to === 'lb' ? roundTo(value / KG_PER_LB, 1) : roundTo(value * KG_PER_LB, 2)
}

/**
 * Unidad con la que arranca el selector del ejecutor (D2 = a): la última que usó el alumno en ese
 * ejercicio → la que prescribió el coach en el bloque (`load_unit`; `sec` no cuenta) → kilos.
 */
export function resolveInitialWeightUnit(input: {
  lastUsed?: string | null
  blockUnit?: string | null
}): WeightUnit {
  if (isWeightUnit(input.lastUsed)) return input.lastUsed
  if (isWeightUnit(input.blockUnit)) return input.blockUnit
  return 'kg'
}

/** Paso de redondeo de una SUGERENCIA mostrada en libras (progresión, autollenado): 2,5 lb. */
export const LB_SUGGESTION_STEP = 2.5

/**
 * Kilos de una sugerencia (progresión / «última vez») → número a mostrar en `unit`. En libras se
 * redondea al 2,5 más cercano (R3): nadie carga 49,6 lb. En kilos, el número tal cual.
 */
export function suggestedWeightInUnit(kg: number, unit: WeightUnit): number {
  if (unit === 'kg') return kg
  return Math.round(kg / KG_PER_LB / LB_SUGGESTION_STEP) * LB_SUGGESTION_STEP
}

/** Rueda de peso por unidad (R3): kg 0–400 en pasos de 2,5 (igual que hoy); lb 0–900 en pasos de 2,5. */
export const WHEEL_WEIGHT_SPECS: Record<WeightUnit, { step: number; min: number; max: number }> = {
  kg: { step: 2.5, min: 0, max: 400 },
  lb: { step: 2.5, min: 0, max: 900 },
}

/** Presets del paso de los chips en libras (R3). Los de kilos siguen en `KEYPAD_STEP_PRESETS`. */
export const KEYPAD_STEP_PRESETS_LB = [1, 2.5, 5, 10] as const

/** Paso por defecto de los chips en libras → -2,5 / +2,5 / +5 (mockup aprobado 26-09). */
export const DEFAULT_KEYPAD_STEP_LB = 2.5
