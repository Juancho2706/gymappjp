import * as Sentry from '@sentry/nextjs'

export type ReportWorkoutQueueDiscardsInput = {
    /** Desglose por causa que devuelve `flushWorkoutQueue` (clave = code, o `max_attempts:<code>`). */
    discardedByCode: Record<string, number>
    /** Total de series descartadas en el flush (suma del desglose). */
    totalDiscarded: number
    /** Series que SÍ entraron en el mismo flush (contexto: ¿fue un flush sano con una baja o un desastre?). */
    flushed: number
    /** Dónde corrió el flush: `layout-sync` (reconexión) o `finish` (botón Finalizar del ejecutor). */
    surface: 'layout-sync' | 'finish'
    /** Contexto extra de la superficie (planId, targetDate…). Va a `extra`, no a tags. */
    extra?: Record<string, unknown>
}

/**
 * Reporta a Sentry las series que el flush DESCARTÓ, **un evento por causa**.
 *
 * Un descarte es una serie que el alumno YA entrenó y que nunca va a llegar al server. El reporte
 * anterior emitía UN solo mensaje fijo ("series descartadas en el flush") con el conteo en `extra`:
 * todo caía en un único issue y era imposible saber si el ruido venía de coaches en pausa (esperable)
 * o de un código nuevo del action sin clasificar comiéndose datos reales (regresión P0).
 *
 * Decisiones de forma, para que el reporte sea accionable:
 *  - **El code va EN EL MENSAJE** porque `captureMessage` agrupa por el texto del mensaje: dos causas
 *    distintas tienen que ser dos issues distintos. Los tags NO afectan el grouping.
 *  - **`fingerprint` explícito** (`['workout-offline-queue','discard',code]`) para blindar ese grouping
 *    aunque el texto del mensaje cambie después (renombrar la copia no debe fusionar/partir issues).
 *  - **Tags** (`area`, `surface`, `discard_code`) porque son indexables y filtrables en la búsqueda de
 *    Sentry (`discard_code:validation`, `surface:finish`); `extra` NO es buscable — sólo se lee
 *    abriendo el evento. Por eso los conteos van a `extra` y las dimensiones a `tags`.
 *
 * Cardinalidad: segura. Los tags de un set CERRADO (los códigos permanentes de `logSetAction` más
 * `max_attempts:<code>`), no de valores libres del usuario — nada de ids ni de mensajes de error.
 */
export function reportWorkoutQueueDiscards({
    discardedByCode,
    totalDiscarded,
    flushed,
    surface,
    extra,
}: ReportWorkoutQueueDiscardsInput): void {
    for (const [code, discarded] of Object.entries(discardedByCode)) {
        if (discarded <= 0) continue
        Sentry.captureMessage(`workout-offline-queue: descarte ${code}`, {
            level: 'warning',
            tags: { area: 'workout-offline-queue', surface, discard_code: code },
            extra: { discarded, totalDiscarded, flushed, ...extra },
            fingerprint: ['workout-offline-queue', 'discard', code],
        })
    }
}
