/**
 * Ejecutor V3 (E4.2) — ADAPTADOR EN EL BORDE para el eje del PR en vivo.
 *
 * La fila de fuerza ya DETECTA el umbral de récord con `prThresholdKg` (máximo histórico de peso del
 * ejercicio) — ese mecanismo se conserva y sigue siendo el DISPARO (`w >= prThresholdKg`, semántica V2).
 * Este helper reusa el MISMO dato y lo pasa por `detectPR` del engine (INTACTO) sólo para clasificar el
 * EJE del récord (peso vs 1RM estimado) y así rotular la celebración; no cambia cuándo se dispara.
 *
 * Sin reps históricas (sólo tenemos el máximo de peso), el histórico sintético se ancla en
 * `{ weight_kg: prThresholdKg, reps_done: 1 }` (Epley con 1 rep ≈ el propio peso). Consecuencia:
 *   - superar el peso máximo            ⇒ `kind: 'weight'`.
 *   - igualar el peso con más reps      ⇒ `kind: 'e1rm'` (mismo peso, 1RM estimado mayor).
 *   - igualar el peso con 1 rep (empate)⇒ `kind: null` (la UI lo rotula como peso por defecto).
 */

import { detectPR, type PrResult } from '@eva/workout-engine'

/**
 * Clasifica el eje de un PR que YA superó el umbral de peso (`prThresholdKg`). `detectPR` queda intacto:
 * sólo le construimos el `setActual` y un histórico de un ancla en el máximo de peso. `repsDone` puede ser
 * `null` (se propaga a `detectPR`, que devuelve `kind: null` para series sin reps válidas).
 */
export function classifyThresholdPr(
    weightKg: number,
    repsDone: number | null,
    prThresholdKg: number,
): PrResult {
    return detectPR(
        { weight_kg: weightKg, reps_done: repsDone },
        [{ weight_kg: prThresholdKg, reps_done: 1 }],
    )
}
