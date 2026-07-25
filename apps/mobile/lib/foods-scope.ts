// Scope de workspace para el catálogo de alimentos del coach (unidad 4B-02).
// Espejo 1:1 del web `foodWorkspaceFilter`
// (apps/web/.../nutrition-plans/_data/nutrition-coach.queries.ts): decide QUÉ
// catálogo ve el scope 'all' del buscador según el workspace activo. RLS sigue
// siendo la barrera real; esto solo elige el catálogo del workspace correcto.

/**
 * Argumento para `.or(...)` de PostgREST que replica la semántica de la web:
 *  - enterprise (orgId presente): alimentos del sistema (coach_id NULL, org_id
 *    NULL) + alimentos de la org (org_id = orgId).
 *  - standalone (coachId presente, orgId null): sistema + propios del coach
 *    (coach_id = coachId, org_id NULL).
 *  - sin coach ni org: solo alimentos del sistema (fail-closed).
 *
 * Nota: espeja el web salvo por el guard de `coachId` null, que la web no
 * necesita (siempre hay coachId); RN sí puede buscar sin sesión de coach.
 */
export function foodWorkspaceFilter(coachId: string | null, orgId: string | null): string {
  if (orgId) {
    return `and(coach_id.is.null,org_id.is.null),org_id.eq.${orgId}`
  }
  if (coachId) {
    return `and(coach_id.is.null,org_id.is.null),and(coach_id.eq.${coachId},org_id.is.null)`
  }
  return 'and(coach_id.is.null,org_id.is.null)'
}
