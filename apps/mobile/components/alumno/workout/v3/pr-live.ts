/**
 * Adaptador de BORDE para el PR en vivo del ejecutor V3 (E4.2) — traduce los datos que YA fluyen por
 * `useWorkoutSession` al shape que consume `detectPR` del motor (`@eva/workout-engine`). El motor es
 * INTOCABLE: acá solo se re-empaqueta la serie recién cerrada y el histórico comparable; toda la lógica
 * de récord (peso vs 1RM estimado, exclusión de sustituidos, "sin histórico ⇒ no es PR") vive en el motor.
 *
 * Dos fuentes de histórico (mismas que alimentan el pulso dorado y la fila "Anterior"):
 *   · `history`       — `previousHistory[exId]`: series del DÍA más reciente del ejercicio (peso + reps),
 *                       la única fuente con reps → habilita el eje 1RM estimado (Epley).
 *   · `allTimeMaxKg`  — `exerciseMaxes[exId]`: mayor peso ALL-TIME del ejercicio (sin reps). Se inyecta
 *                       como ancla para que el PR de PESO se mida contra el máximo histórico REAL y no
 *                       solo contra la última sesión (evita el PR falso "superé mi última vez"). `reps:1`
 *                       da un piso de 1RM conservador para esa marca (su 1RM real es ≥, nunca lo infla).
 *
 * TypeScript puro: sin React / RN. Se testea en `tests/mobile/executor-v3-celebration.test.ts`.
 */
import { detectPR, type PrResult, type PrSet } from '@eva/workout-engine'
import type { PrevSet } from '../../../../lib/workout-session'

export interface LivePrInput {
  /** Peso de la serie recién cerrada (kg); null en tipadas ⇒ nunca es PR de peso. */
  weightKg: number | null
  /** Reps de la serie recién cerrada; null en tipadas. */
  repsDone: number | null
  /** true si el bloque está sustituido: `detectPR` lo descarta (anti-PR-falso AC-C5). */
  substituted: boolean
  /** Histórico reciente del ejercicio (mismo array que `previousHistory[exId]`). */
  history: readonly PrevSet[]
  /** Máximo de peso all-time del ejercicio (`exerciseMaxes[exId]`); 0/null si no hay histórico. */
  allTimeMaxKg: number | null | undefined
}

/**
 * Corre `detectPR` del motor contra el histórico ya cargado. Devuelve el `PrResult` crudo del motor
 * (`isPR`, `kind` weight|e1rm, `prevBest`). Sin histórico comparable ⇒ `isPR:false` (primer registro no
 * es récord real), alineado con `celebrationTierFor('pr_detectado', { isRealPR })`.
 */
export function computeLivePr(input: LivePrInput): PrResult {
  const setActual: PrSet = {
    weight_kg: input.weightKg,
    reps_done: input.repsDone,
    substituted: input.substituted,
  }
  const historico: PrSet[] = input.history.map((h) => ({
    weight_kg: h.weight_kg,
    reps_done: h.reps_done,
  }))
  const allTime = input.allTimeMaxKg ?? 0
  if (allTime > 0) {
    historico.push({ weight_kg: allTime, reps_done: 1 })
  }
  return detectPR(setActual, historico)
}
