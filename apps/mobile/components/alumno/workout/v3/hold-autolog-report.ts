/**
 * Sentry del AUTO-envío del hold (specs/cuenta-atras-en-pantalla, W6.2 · DATA-TESTING §8.3).
 *
 * Una sola función porque el guard es la mitad del contrato: **sólo se reporta el camino del reloj**
 * (`hold_source === 'timer'`). El camino manual ya tiene su chip de «Reintentar» en la fila — el
 * alumno ve el error y lo resuelve —, así que meterlo acá inflaría el denominador del umbral de
 * alarma (§8.4: > 2 % de auto-envíos con error en 72 h ⇒ se apaga el auto-guardado) con fallos que
 * nadie perdió.
 *
 * Espejo exacto del helper web (`apps/web/src/app/c/[coach_slug]/workout/[planId]/hold-autolog-report.ts`):
 * mismo tag `area: 'hold-autolog'` y mismas tres claves de `extra`, o los dos clientes no se pueden
 * contar juntos. Lo único que cambia es el SDK (`@sentry/react-native` vs `@sentry/nextjs`).
 *
 * Sin PII: `blockId` es un id de bloque; nunca viaja nombre, correo ni dato de salud del alumno.
 */
import * as Sentry from '@sentry/react-native'

export interface HoldAutologErrorContext {
  /** Marca de fuente de la serie (`metadata.hold_source`). Sólo `'timer'` reporta. */
  source: string | null | undefined
  blockId: string
  /** `'mobility'` | `'strength'` — el tipo efectivo del bloque. */
  exerciseType: string
  /** Pantalla sola o miembro de una superserie. */
  context: 'solo' | 'superset'
}

/**
 * Reporta el fallo de un auto-envío disparado por el reloj. Devuelve `true` si efectivamente se
 * capturó (útil para los tests del guard). NUNCA lanza: un Sentry sin inicializar no puede tumbar
 * el commit de una serie (mismo patrón que `session-morph.tsx:336`).
 */
export function reportHoldAutologError(err: unknown, ctx: HoldAutologErrorContext): boolean {
  if (ctx.source !== 'timer') return false
  try {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { area: 'hold-autolog' },
      extra: { blockId: ctx.blockId, exerciseType: ctx.exerciseType, context: ctx.context },
    })
    return true
  } catch {
    // Sentry no inicializado / versión sin API → no-op silencioso.
    return false
  }
}
