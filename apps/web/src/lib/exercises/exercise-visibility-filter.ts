/**
 * Scope de VISIBILIDAD del catálogo de ejercicios: qué filas de `exercises` ve el contexto activo.
 * Fuente única del predicado `.or()` de PostgREST, compartida por el catálogo (`getExerciseCatalog`)
 * y el builder de PLANTILLAS (`getTemplateBuilderData`) — que lo tenía a mano, con solo 2 vías.
 *
 * Tres vías, en este orden de precedencia:
 *   1. workspace team activo ⇒ sistema + catálogo del POOL (AC6/AC11). Los ejercicios PERSONALES
 *      quedan fuera a propósito: en contexto team no son asignables (bloque fantasma para el alumno
 *      del pool, que no pasa `exercises_client_coach_select`), y ofrecer «Editar» sobre uno personal
 *      terminaba en el error explícito de la action.
 *   2. contexto org ⇒ sistema + catálogo de la org.
 *   3. coach standalone ⇒ sistema + los propios.
 *
 * El predicado «sistema» exige los TRES dueños NULL: con solo `coach_id.is.null` una fila de team u
 * org (que también tiene `coach_id` NULL) se colaba como si fuera del sistema.
 *
 * Esto es VISIBILIDAD, nunca autorización: la RLS de `exercises` sigue mandando.
 */

export interface ExerciseVisibilityScope {
    coachId?: string | null
    orgId?: string | null
    teamId?: string | null
}

const SYSTEM_PREDICATE = 'and(coach_id.is.null,org_id.is.null,team_id.is.null)'

/** Predicado para `.or(...)` de PostgREST. Sin dueño resoluble devuelve solo los del sistema. */
export function exerciseVisibilityOrFilter(scope: ExerciseVisibilityScope): string {
    if (scope.teamId) return `${SYSTEM_PREDICATE},team_id.eq.${scope.teamId}`
    if (scope.orgId) return `${SYSTEM_PREDICATE},org_id.eq.${scope.orgId}`
    if (scope.coachId) return `${SYSTEM_PREDICATE},coach_id.eq.${scope.coachId}`
    return SYSTEM_PREDICATE
}
