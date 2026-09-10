/**
 * Descanso POST-COMMIT — modelo puro de la matriz 2×4 (specs/cuenta-atras-en-pantalla, W5.T5(a) ·
 * R24 / D2 / A7).
 *
 * Una sola regla para las dos plataformas: al cerrar una serie, ¿quién arranca el cronómetro de
 * descanso? Existe para que RN (`ExecutorV3.maybeStartRest`) y web (`WorkoutExecutionClient` +
 * `LogSetForm`) no puedan divergir celda a celda, y para que el test de paridad tenga contra qué
 * afirmar sin montar dos ejecutores.
 *
 * | Contexto                     | Pref OFF    | Pref ON      |
 * |------------------------------|-------------|--------------|
 * | Pantalla sola                | `offer-cta` | `auto-start` |
 * | Superserie, NO último        | `none`      | `none`       |
 * | Superserie, ÚLTIMO de ronda  | `offer-cta` | `auto-start` |
 * | Sin `rest_time` (o 0)        | `none`      | `none`       |
 *
 * Dos lecturas obligatorias de esa tabla:
 *  · **V4 manda entre miembros**: en `superset-mid` la preferencia NO aplica — no hay descanso entre
 *    miembros de la ronda, se sigue sin detenerse.
 *  · **A7**: sin `rest_time` no hay nada que arrancar NI que ofrecer; ahí tampoco se pinta CTA.
 *
 * `holdSource` viaja para telemetría/QA y **no decide** (mismo criterio que `shouldDeferRoundRest`):
 * quien dejó la preferencia encendida pidió justamente que el descanso arranque solo, también cuando
 * la serie la cerró el reloj.
 */

/** Dónde se cerró la serie. `superset-last` = esa serie cerró la ronda del grupo (D2). */
export type RestAfterCommitContext = 'solo' | 'superset-mid' | 'superset-last'

/**
 * · `auto-start` — el ORQUESTADOR llama `startRest` en el commit (comportamiento de siempre).
 * · `offer-cta`  — nadie arranca nada: se pinta el par «Descansar N s» / «Siguiente serie» (R24) y el
 *                  único camino a `startRest` es el toque del alumno.
 * · `none`       — no hay descanso que arrancar ni que ofrecer.
 */
export type RestAfterCommitDecision = 'auto-start' | 'offer-cta' | 'none'

export interface RestAfterCommitInput {
    /** Preferencia «Pasar solo al descanso» del alumno (D5), ya resuelta por `readAutoRestPref`. */
    autoRestEnabled: boolean
    context: RestAfterCommitContext
    /**
     * Segundos de descanso aplicables: el del bloque (o el de aproximación) en `solo`, el máximo del
     * grupo en `superset-last`. `<= 0` ⇒ no hay nada que hacer (A7).
     */
    restSec: number
    /**
     * `metadata.hold_source` de la serie recién cerrada (`null` = no fue un hold). Se recibe para que
     * el llamador no tenga que decidir si importa: **no decide** (paridad con `shouldDeferRoundRest`).
     */
    holdSource?: string | null
}

/** PURA: la matriz 2×4 de arriba, sin ramas ocultas. */
export function resolveRestAfterCommit(input: RestAfterCommitInput): RestAfterCommitDecision {
    // A7 — sin descanso configurado no hay nada que arrancar ni que ofrecer, con la pref como esté.
    if (!(input.restSec > 0)) return 'none'
    // V4 — entre miembros de la ronda nunca hay descanso: la preferencia no aplica.
    if (input.context === 'superset-mid') return 'none'
    return input.autoRestEnabled ? 'auto-start' : 'offer-cta'
}
