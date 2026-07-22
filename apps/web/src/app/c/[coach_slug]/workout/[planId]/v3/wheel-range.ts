/**
 * Rango de la rueda de captura dual (E2.5). Puro y testeable: produce la lista corta de valores
 * (kg o reps) CENTRADA en el valor anterior, para que la rueda estilo iOS arranque en el último
 * peso/reps del alumno. Sin React ni DOM — la rueda (web scroll-snap · RN Reanimated) sólo consume
 * este contrato y entrega el valor elegido por los mecanismos de prefill/submit existentes.
 *
 * Contrato compartido con RN (mismo cálculo, distinta presentación):
 *   - kg   → paso 2,5 · radio ±20 · min 0 · fallback 20
 *   - reps → paso 1   · radio ±10 · min 0 · fallback 10
 */

export interface WheelRangeSpec {
    /** Valor anterior (peso/reps) alrededor del cual se centra la rueda. null ⇒ usa `fallback`. */
    center: number | null
    /** Incremento entre topes de la rueda (kg 2,5 · reps 1). */
    step: number
    /** Amplitud a cada lado del centro (kg ±20 · reps ±10). */
    radius: number
    /** Piso del rango (no se generan valores por debajo). Default 0. */
    min?: number
    /** Centro cuando no hay valor anterior. Default = `min`. */
    fallback?: number
}

/** Presets del contrato (kg/reps) — mismos que RN. */
export const WHEEL_KG_SPEC = { step: 2.5, radius: 20, min: 0, fallback: 20 } as const
export const WHEEL_REPS_SPEC = { step: 1, radius: 10, min: 0, fallback: 10 } as const

/** Redondeo defensivo del error de punto flotante (2,5 · 0,1…) a 3 decimales. */
function round3(n: number): number {
    return Math.round(n * 1000) / 1000
}

/**
 * Construye el rango ASCENDENTE de la rueda: centra en `center` (snapeado a la grilla del paso
 * relativa a `min`), extiende ±`radius` en pasos de `step` y descarta lo que caiga bajo `min`.
 * Devuelve `[]` ante parámetros inválidos (paso ≤ 0 o radio < 0).
 */
export function buildWheelRange({ center, step, radius, min = 0, fallback = min }: WheelRangeSpec): number[] {
    if (!(step > 0) || !(radius >= 0)) return []
    const raw = center != null && Number.isFinite(center) ? center : fallback
    const base = Math.max(min, raw)
    // Snap a la grilla del paso anclada en `min` (p.ej. min 0, paso 2,5 → …0 · 2,5 · 5…).
    const snapped = min + Math.round((base - min) / step) * step
    const stepsEachSide = Math.round(radius / step)
    const out: number[] = []
    for (let k = -stepsEachSide; k <= stepsEachSide; k += 1) {
        const value = round3(snapped + k * step)
        if (value < min) continue
        out.push(value)
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
