/**
 * Dosificación de celebraciones del ejecutor v3 — mapeo PURO de evento semántico → nivel (tier).
 * TypeScript puro: sin React / RN. La capa de UI (E4.1) consume el tier para elegir la
 * animación/haptic (micro = check+tick, media = ejercicio/ronda, épica = confetti de fin/PR real).
 *
 * Regla de diseño (SPEC executor-v3): NO todo evento celebra. La mayoría de los cues (descansos,
 * fases de intervalo) son señales funcionales, no premios — celebrarlos devaluaría el hito real. La
 * épica se RESERVA para cerrar la sesión y para un PR real (no un "primer registro" que aún no tiene
 * con qué compararse). Así la escala de recompensa no se inflaciona.
 */

/**
 * Evento semántico emitido por el motor durante la ejecución. Distingue HITOS (que pueden celebrar)
 * de CUES (señales funcionales que nunca celebran):
 * - `serie_cerrada`        — el alumno registró y cerró una serie (hito micro).
 * - `ejercicio_completado` — última serie de un ejercicio (hito medio).
 * - `ronda_cerrada`        — se cerró una ronda de superserie/circuito (hito medio).
 * - `pr_detectado`         — se detectó un posible récord (épico SOLO si es PR real; ver ctx).
 * - `descanso_inicio`      — arrancó el descanso (cue).
 * - `descanso_aviso`       — faltan pocos segundos de descanso (cue).
 * - `descanso_fin`         — terminó el descanso (cue).
 * - `cambio_lado`          — cambiar al lado contrario en un ejercicio unilateral (hito micro).
 * - `pasada_roller`        — se completó una pasada de foam roller (hito micro).
 * - `fase_intervalo`       — cambió la fase del timer de intervalos (cue).
 * - `sesion_completada`    — se cerró la sesión completa (hito épico).
 */
export type WorkoutCelebrationEvent =
    | 'serie_cerrada'
    | 'ejercicio_completado'
    | 'ronda_cerrada'
    | 'pr_detectado'
    | 'descanso_inicio'
    | 'descanso_aviso'
    | 'descanso_fin'
    | 'cambio_lado'
    | 'pasada_roller'
    | 'fase_intervalo'
    | 'sesion_completada'

/** Nivel de celebración; la UI escala animación + haptic + confetti por tier. */
export type CelebrationTier = 'micro' | 'media' | 'epica'

/**
 * Contexto mínimo para dosificar. Sólo `pr_detectado` lo necesita: distingue un PR REAL (supera el
 * mejor histórico) de una detección sin base de comparación (primer registro del ejercicio), que no
 * merece la épica. Los demás eventos ignoran el contexto.
 */
export interface CelebrationContext {
    /** true ⇒ el evento `pr_detectado` es un récord real (hay histórico y se superó). */
    isRealPR?: boolean
}

/**
 * Tier de celebración para un evento (o `null` si es un cue que no celebra).
 *   - épica: `sesion_completada`, o `pr_detectado` con `ctx.isRealPR`.
 *   - media: `ejercicio_completado`, `ronda_cerrada`.
 *   - micro: `serie_cerrada`, `pasada_roller`, `cambio_lado`.
 *   - null:  descansos, `fase_intervalo`, y `pr_detectado` que NO es un PR real.
 * Pura y exhaustiva sobre el union (el `default` es defensivo ante eventos futuros sin dosificar).
 */
export function celebrationTierFor(
    event: WorkoutCelebrationEvent,
    ctx: CelebrationContext = {},
): CelebrationTier | null {
    switch (event) {
        case 'sesion_completada':
            return 'epica'
        case 'pr_detectado':
            return ctx.isRealPR ? 'epica' : null
        case 'ejercicio_completado':
        case 'ronda_cerrada':
            return 'media'
        case 'serie_cerrada':
        case 'pasada_roller':
        case 'cambio_lado':
            return 'micro'
        case 'descanso_inicio':
        case 'descanso_aviso':
        case 'descanso_fin':
        case 'fase_intervalo':
            return null
        default:
            return null
    }
}
