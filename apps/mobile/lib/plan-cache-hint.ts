/**
 * Pista (sólo TELEMETRÍA) de si el ejecutor tenía el plan en la caché offline cuando intentó abrirlo.
 *
 * Por qué existe: el aviso `exec-v3-despegue-force-ready-sin-escena` (Sentry `EVA-MOBILE-F`) cuenta
 * que la ceremonia del Despegue se rindió a los 4,6 s, pero no distingue dos historias muy distintas:
 * el alumno que YA tenía su rutina en disco y aun así no la vio pintada (culpa del waterfall de carga
 * ⇒ código) del que la abría por primera vez sin red (no había nada que pintar ⇒ red). El overlay no
 * puede leer AsyncStorage en el medio de la ceremonia sin volverse asíncrono, así que
 * `useWorkoutSession` deja la pista al pasar por la caché y el overlay la lee de memoria.
 *
 * Es un puente a nivel MÓDULO, igual que `morphConsumeState` de `session-morph.tsx`: una sola entrada
 * (la del último plan que se intentó abrir), sin IDs nuevos y sin nada persistido. Va con `planId`
 * para que la pista de un plan anterior no se lea como la de éste; un plan que nadie leyó todavía
 * responde `'unknown'`, que ES la información útil (el ejecutor ni llegó a mirar el disco).
 */

export type PlanCacheHint = 'yes' | 'no' | 'unknown'

let lastRead: { planId: string; hit: boolean } | null = null

/** La sesión avisa qué encontró en la caché del plan (`getCachedPlan`). */
export function notePlanCacheHint(planId: string, hit: boolean): void {
  lastRead = { planId, hit }
}

/** Lectura barata y síncrona para el `extra` del aviso. Sin pista de ESTE plan ⇒ `'unknown'`. */
export function peekPlanCacheHint(planId: string): PlanCacheHint {
  if (!lastRead || lastRead.planId !== planId) return 'unknown'
  return lastRead.hit ? 'yes' : 'no'
}

/** Sólo para tests: vuelve al estado «nadie leyó la caché todavía». */
export function resetPlanCacheHint(): void {
  lastRead = null
}
