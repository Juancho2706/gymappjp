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
import { getExchangeGroupsForCoach } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
  authorizeCoach,
  fail,
  type ActionFailure,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

const InputSchema = z.object({ clientId: z.string().uuid() })

export type LoadExchangeGroupsResult = { ok: true; groups: ExchangeGroup[] } | ActionFailure

/**
 * Catálogo de grupos elegibles como target de porciones para el builder.
 * Solo lectura; el orden para el picker (system primero) lo aplica el cliente
 * (`sortGroupsForPicker`). El freeze del snapshot NO ocurre aquí: lo hace la
 * persistencia del draft (Ola 0, T0.3) resolviendo los grupos de nuevo server-side.
 */
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
    const groups = await getExchangeGroupsForCoach(
      auth.db as unknown as SupabaseClient<Database>,
      auth.userId,
      scope,
    )
    return { ok: true, groups }
  } catch {
    // El picker muestra estado de error con reintento (SPEC UX-c); los items fijos
    // de la franja nunca se bloquean por esta falla.
    return fail('GROUPS_LOAD_FAILED', 'No pudimos cargar los grupos.')
  }
}
