import { z } from 'zod'

// Logica pura y contrato de entrada de `archivePlanAction` (web coach). Vive fuera del archivo
// 'use server' para poder testear el Zod y la clasificacion del resultado del UPDATE sin cargar
// modulos server-only. El dominio V2 NUNCA borra: "eliminar" un plan = archivarlo
// (nutrition_plans_v2.lifecycle_status 'active' -> 'archived' + archived_at). El historial de
// consumo/adherencia se conserva; el alumno solo deja de ver el plan vigente.

export const ArchivePlanInputSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
})
export type ArchivePlanInput = z.infer<typeof ArchivePlanInputSchema>

export type ArchivePlanFailureCode = 'PLAN_NOT_FOUND' | 'SCOPE_DENIED' | 'WRITE_FAILED'

export type ArchiveWriteOutcome =
  | { code: 'OK' }
  | { code: ArchivePlanFailureCode; error: string }

/**
 * Clasifica el resultado del UPDATE de archivado (pura, testeable sin DB). El UPDATE corre
 * RLS-scoped con `.select('id')` y un WHERE que exige `lifecycle_status = 'active'`:
 * - error 42501 (WITH CHECK / column grants / trigger de identidad) -> SCOPE_DENIED.
 * - cualquier otro error de DB -> WRITE_FAILED.
 * - 0 filas afectadas (RLS no ve la fila por estar fuera del pool, o el plan ya no esta
 *   'active': inexistente, ya archivado, o no pertenece al alumno) -> PLAN_NOT_FOUND.
 * - >=1 fila -> OK.
 */
export function classifyArchiveWrite(input: {
  errorCode: string | null | undefined
  rowsAffected: number
}): ArchiveWriteOutcome {
  const { errorCode, rowsAffected } = input
  if (errorCode) {
    if (errorCode === '42501') {
      return { code: 'SCOPE_DENIED', error: 'No tienes permiso para archivar el plan de este alumno.' }
    }
    return { code: 'WRITE_FAILED', error: 'No se pudo archivar el plan. Intenta nuevamente.' }
  }
  if (rowsAffected <= 0) {
    return { code: 'PLAN_NOT_FOUND', error: 'No se encontro un plan vigente para archivar.' }
  }
  return { code: 'OK' }
}
