/**
 * Segundos EFECTIVOS de descanso al cerrar una serie — regla única para web y RN.
 *
 * Reporte de un alumno (Víctor, 2026-09-11): «con "Pasar solo al descanso" a veces salta el descanso
 * y va al próximo ejercicio». Causa: bloques con `rest_time` vacío (el builder crea movilidad, cardio
 * y roller con `''`) ⇒ `resolveRestAfterCommit` devolvía `none` y el ejecutor cortaba el descanso.
 * Regla de producto del owner: terminar una serie SIEMPRE lleva al descanso; saltarlo lo decide el
 * alumno. Por eso, sin descanso configurado (o con uno que parsea a 0) se usa un fallback fijo en vez
 * de «nada».
 *
 * Descanso de aproximación: la 1ª serie de un bloque de ≥3 series usa `warmup_rest_time` SOLO si ese
 * valor es > 0; si está vacío o parsea a 0 se cae al `rest_time` normal, y recién después al fallback
 * (antes un warmup vacío dejaba la serie 1 sin descanso aunque el bloque tuviera 90 s).
 */

/** Descanso por defecto cuando el bloque (o el grupo) no trae ninguno válido. */
export const DEFAULT_REST_FALLBACK_SEC = 60

export type EffectiveRestSource = 'warmup' | 'block' | 'fallback'

export interface EffectiveRestInput {
    /** `parseRestTime(block.rest_time)` — o el máximo del grupo en superserie. `<= 0` = no hay. */
    restSec: number
    /** `parseRestTime(block.warmup_rest_time)`; `null`/`undefined` = sin descanso de aproximación. */
    warmupRestSec?: number | null
    /** `setNumber === 1 && sets >= 3` (M2·6). Solo se honra si `warmupRestSec > 0`. */
    useWarmup?: boolean
}

export interface EffectiveRest {
    /** Siempre `> 0`. */
    seconds: number
    source: EffectiveRestSource
    /** `true` solo cuando se usó el descanso de aproximación (para `startRest({ warmup })`). */
    warmup: boolean
}

/** PURA: warmup válido → rest_time válido → fallback. Nunca devuelve 0. */
export function resolveEffectiveRest(input: EffectiveRestInput): EffectiveRest {
    const warmup = input.warmupRestSec ?? 0
    if (input.useWarmup && warmup > 0) return { seconds: warmup, source: 'warmup', warmup: true }
    if (input.restSec > 0) return { seconds: input.restSec, source: 'block', warmup: false }
    return { seconds: DEFAULT_REST_FALLBACK_SEC, source: 'fallback', warmup: false }
}
