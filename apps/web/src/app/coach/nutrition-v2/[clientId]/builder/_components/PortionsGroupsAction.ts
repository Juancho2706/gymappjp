'use server'

/**
 * Server action del picker de grupos de porciones (T1.1). Carga los grupos de
 * intercambio VIVOS del coach (9 system + custom por scope 3-vías) SERVER-SIDE,
 * reusando el servicio V1 `getExchangeGroupsForCoach` — permitido: los services V1
 * son reutilizables; lo prohibido es montarlos en el bundle CLIENTE (boundary F4).
 * Este archivo es 'use server': sus imports jamás llegan al cliente.
 *
 * Vive junto a los componentes del builder (no en `_actions/`) porque esa carpeta
 * pertenece a otras tareas de la ola — regla de archivos disjuntos del build.
 *
 * Fail-closed como el resto del builder: authorizeCoach re-verifica sesión, rate
 * limit (cupo laxo de catálogo: es una lectura), rollout V2 y scope del workspace.
 * Sin gate de módulo nuevo: porciones viene con todo plan pago (SPEC, decisión CEO).
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { getExchangeGroupsForCoach } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
  authorizeCoach,
  fail,
  type ActionFailure,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

const InputSchema = z.object({ clientId: z.string().uuid() })

/**
 * Cuantos alimentos equivalentes tiene cada grupo (`groupId -> n`), con el MISMO alcance de
 * tenant que el sheet del alumno (global sin dueno / del coach / de su org — espejo de
 * `20260803194000_nutrition_v2_exchange_foods_tenant_scope.sql`).
 *
 * Sin este dato el coach elige grupos a ciegas y, sobre todo, no se entera de que el grupo
 * propio que acaba de crear nace VACIO: su alumno abre el sheet "1 porcion equivale a" y no
 * ve ningun ejemplo. Ese silencio es la razon por la que la funcion existia desde julio y
 * nadie la usaba.
 */
export type ExchangeGroupFoodCounts = Record<string, number>

export type LoadExchangeGroupsResult =
  | { ok: true; groups: ExchangeGroup[]; foodCounts: ExchangeGroupFoodCounts }
  | ActionFailure

/**
 * Catálogo de grupos elegibles como target de porciones para el builder.
 * Solo lectura; el orden para el picker (system primero) lo aplica el cliente
 * (`sortGroupsForPicker`). El freeze del snapshot NO ocurre aquí: lo hace la
 * persistencia del draft (Ola 0, T0.3) resolviendo los grupos de nuevo server-side.
 */
/**
 * Cuenta equivalencias por grupo con UNA sola lectura indexada
 * (`foods_exchange_group_id_idx`), agregando en memoria: PostgREST no expone `group by`, y
 * una consulta por grupo serian 10+ round-trips en el camino caliente del builder.
 *
 * El alcance lo pone la RLS de `foods` con el cliente del coach (globales + propios + org):
 * es exactamente el mismo conjunto que vera el alumno, asi que el numero no miente. Se
 * cuentan solo los que tienen `exchange_portion_grams`, que es lo que el sheet exige para
 * mostrar "1 porcion equivale a N g".
 */
async function countExchangeFoodsByGroup(
  db: SupabaseClient<Database>,
  groupIds: string[],
): Promise<ExchangeGroupFoodCounts> {
  if (groupIds.length === 0) return {}
  const { data, error } = await db
    .from('foods')
    .select('exchange_group_id')
    .in('exchange_group_id', groupIds)
    .not('exchange_portion_grams', 'is', null)
  // El conteo es informativo: si falla, el picker sigue funcionando sin la linea de apoyo.
  if (error || data == null) return {}
  const counts: ExchangeGroupFoodCounts = {}
  for (const row of data) {
    const id = (row as { exchange_group_id: string | null }).exchange_group_id
    if (id == null) continue
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export async function loadExchangeGroupsForBuilderAction(input: unknown): Promise<LoadExchangeGroupsResult> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Solicitud invalida.')
  }

  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  const workspace = auth.workspace
  const scope = {
    orgId: workspace?.type === 'enterprise_coach' ? workspace.orgId : null,
    activeTeamId: workspace?.type === 'coach_team' ? workspace.teamId : null,
  }

  try {
    const db = auth.db as unknown as SupabaseClient<Database>
    const groups = await getExchangeGroupsForCoach(db, auth.userId, scope)
    const foodCounts = await countExchangeFoodsByGroup(db, groups.map((group) => group.id))
    return { ok: true, groups, foodCounts }
  } catch {
    // El picker muestra estado de error con reintento (SPEC UX-c); los items fijos
    // de la franja nunca se bloquean por esta falla.
    return fail('GROUPS_LOAD_FAILED', PORTIONS_COPY.builder.pickerError)
  }
}
