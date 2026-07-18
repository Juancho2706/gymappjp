'use server'

import { revalidatePath } from 'next/cache'
import {
  authorizeCoach,
  fail,
  zodFields,
  type ActionFailure,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import {
  ArchivePlanInputSchema,
  classifyArchiveWrite,
} from '@/app/coach/nutrition-v2/_lib/archive-plan'

// Server action "Archivar plan vigente" (web coach). El dominio V2 no borra: archivar =
// nutrition_plans_v2.lifecycle_status 'active' -> 'archived' + archived_at. El historial de
// consumo se conserva; el alumno deja de ver el plan (get_nutrition_plan_read_v2 filtra por
// lifecycle_status='active'). Fail-closed: authorizeCoach re-verifica el gate (rollout/webCoach)
// y el scope del workspace; el UPDATE corre con el cliente RLS de la sesion (JAMAS service role).
// La RLS (nutrition_plans_v2_update, USING can_manage_client) es la barrera real; aca cerramos
// el WHERE por id+client+active y clasificamos el resultado con un helper puro.

export type ArchivePlanActionResult = { ok: true } | ActionFailure

// Interfaz minima para el UPDATE de archivado. `nutrition_plans_v2` no esta en database.types.ts
// (dominio V2 aditivo), asi que casteamos el cliente de la sesion a esta forma acotada — mismo
// patron que `NutritionV2Db` en plan-persistence.ts. El chain `.update().eq()*.select()` refleja
// PostgREST: `.select('id')` devuelve las filas afectadas por RLS+WHERE.
type ArchiveDbResult = {
  data: Array<{ id: string }> | null
  error: { code?: string; message?: string } | null
}
interface ArchiveUpdateChain {
  eq(column: string, value: unknown): ArchiveUpdateChain
  select(columns: string): PromiseLike<ArchiveDbResult>
}
interface ArchiveDb {
  from(table: string): { update(values: Record<string, unknown>): ArchiveUpdateChain }
}

export async function archivePlanAction(input: unknown): Promise<ArchivePlanActionResult> {
  const parsed = ArchivePlanInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'La solicitud tiene datos invalidos.', zodFields(parsed.error))
  }
  const { clientId, planId } = parsed.data

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return auth
  const { userId } = auth
  const db = auth.db as unknown as ArchiveDb

  // UPDATE RLS-scoped e idempotente: el WHERE exige lifecycle_status='active', asi que archivar
  // dos veces no revive nada (2da vez -> 0 filas -> PLAN_NOT_FOUND, no un error). No tocamos
  // columnas de identidad/scope (id/client_id/coach_id/org_id/team_id/created_by/current_version),
  // que el trigger nutrition_v2_guard_plan_identity congela: solo lifecycle_status/archived_at/
  // updated_by. El WITH CHECK de la policy (scope_matches_client) sigue valido porque el scope
  // no cambia. La constraint nutrition_plans_v2_archive_state_check exige archived_at con archived.
  const { data, error } = await db
    .from('nutrition_plans_v2')
    .update({
      lifecycle_status: 'archived',
      archived_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', planId)
    .eq('client_id', clientId)
    .eq('lifecycle_status', 'active')
    .select('id')

  const outcome = classifyArchiveWrite({ errorCode: error?.code, rowsAffected: data?.length ?? 0 })
  if (outcome.code !== 'OK') {
    return fail(outcome.code, outcome.error)
  }

  // Ficha V2, hub del coach y ficha principal del alumno reflejan el cambio de inmediato.
  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + clientId)
  revalidatePath('/coach/clients/' + clientId)
  return { ok: true }
}
