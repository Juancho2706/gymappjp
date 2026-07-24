/**
 * Rango de la rueda de captura dual (E2.5). Puro y testeable: produce la lista COMPLETA de valores
 * (kg o reps) de la grilla, para que la rueda estilo iOS ofrezca todo el catálogo y ARRANQUE CENTRADA
 * en el valor anterior/prescrito (vía `nearestWheelIndex`). Sin React ni DOM — la rueda (web
 * scroll-snap · RN Reanimated) sólo consume este contrato y entrega el valor elegido por los
 * mecanismos de prefill/submit existentes.
 *
 * Decisión CEO (QA4): rango COMPLETO en vez de una ventana ±alrededor del anterior.
 *   - kg   → 0 a 400 kg en pasos de 2,5  (161 topes)
 *   - reps → 0 a 100 en pasos de 1       (101 topes)
 * La rueda abre centrada en el anterior con `nearestWheelIndex(range, prev)` (initialIndex sobre el
 * rango completo). Contrato compartido con RN (mismos rangos, distinta presentación).
 */

export interface WheelRangeSpec {
    /**
     * Valor anterior (peso/reps). Ya NO altera la lista generada (el rango es completo y fijo); se
     * conserva por compatibilidad de llamada y para documentar la intención — la posición inicial se
     * resuelve aparte con `nearestWheelIndex`.
     */
    center?: number | null
    /** Incremento entre topes de la rueda (kg 2,5 · reps 1). */
    step: number
    /** Piso del rango (inclusive). Default 0. */
    min?: number
    /** Techo del rango (inclusive). */
    max: number
}

/** Presets del contrato (kg/reps) — mismos que RN. Rango COMPLETO (decisión CEO QA4). */
export const WHEEL_KG_SPEC = { step: 2.5, min: 0, max: 400 } as const
export const WHEEL_REPS_SPEC = { step: 1, min: 0, max: 100 } as const

/** Redondeo defensivo del error de punto flotante (2,5 · 0,1…) a 3 decimales. */
function round3(n: number): number {
    return Math.round(n * 1000) / 1000
}

/**
 * Construye el rango ASCENDENTE COMPLETO de la rueda: de `min` a `max` (ambos inclusive) en pasos de
 * `step`. Independiente del valor anterior (la rueda ofrece todo el catálogo; el anterior sólo fija la
 * posición inicial vía `nearestWheelIndex`). Devuelve `[]` ante parámetros inválidos (paso ≤ 0 o
 * `max` < `min`).
 */
export function buildWheelRange({ step, min = 0, max }: WheelRangeSpec): number[] {
    if (!(step > 0) || !(max >= min)) return []
    const steps = Math.round((max - min) / step)
    const out: number[] = []
    for (let k = 0; k <= steps; k += 1) {
        out.push(round3(min + k * step))
    }
    return out
}

/**
 * Índice del valor del rango más cercano a `value` (para posicionar la rueda en el anterior). Si no
 * hay valor, cae al centro del rango. Rango vacío ⇒ 0.
 */
export function nearestWheelIndex(range: number[], value: number | null): number {
    if (range.length === 0) return 0
    if (value == null || !Number.isFinite(value)) return Math.floor(range.length / 2)
    let bestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < range.length; i += 1) {
        const dist = Math.abs(range[i] - value)
        if (dist < bestDist) {
            bestDist = dist
            bestIdx = i
        }
    }
    return bestIdx
}
