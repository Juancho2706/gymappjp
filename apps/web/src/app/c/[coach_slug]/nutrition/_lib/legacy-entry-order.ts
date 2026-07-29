/**
 * NUT-015 — Orden de resolución de la entrada legacy `/c/[coach_slug]/nutrition`.
 *
 * El tab "Nutrición" de la barra del alumno apunta SIEMPRE a `/nutrition` (enlace estable,
 * ver `ClientNav.tsx`): esa ruta es la que decide V1 vs V2 por rollout. El bug histórico era
 * de ORDEN: la página leía el plan V1 primero y hacía `return` temprano cuando no existía,
 * así que un alumno nativo V2 (sin fila V1, el caso normal desde que el builder V2 escribe
 * solo en tablas `*_v2`) veía "Sin plan asignado" en vez de aterrizar en V2.
 *
 * Este helper fija el orden correcto y lo hace testeable sin renderizar el RSC completo:
 *   1. scope del alumno (coach/team/org),
 *   2. gate de rollout V2 → si está ON, redirigir sin tocar nada de V1,
 *   3. recién ahí, el plan V1.
 *
 * Beneficio extra: con V2 ON el alumno deja de pagar la query V1 con su join anidado.
 * Mismo orden que ya usa `nutrition/add/page.tsx`.
 */
export type LegacyNutritionEntry<TScope, TPlan> =
  | { kind: 'redirect-v2'; scope: TScope }
  | { kind: 'no-v1-plan'; scope: TScope }
  | { kind: 'v1'; scope: TScope; plan: TPlan }

export async function resolveLegacyNutritionEntry<TScope, TPlan>(deps: {
  loadScope: () => Promise<TScope>
  isV2Enabled: (scope: TScope) => Promise<boolean>
  loadV1Plan: () => Promise<TPlan | null>
}): Promise<LegacyNutritionEntry<TScope, TPlan>> {
  const scope = await deps.loadScope()

  // Gate ANTES del fan-out V1: fail-closed (con el flag apagado la página sigue siendo V1 intacta).
  if (await deps.isV2Enabled(scope)) {
    return { kind: 'redirect-v2', scope }
  }

  const plan = await deps.loadV1Plan()
  if (!plan) return { kind: 'no-v1-plan', scope }
  return { kind: 'v1', scope, plan }
}
