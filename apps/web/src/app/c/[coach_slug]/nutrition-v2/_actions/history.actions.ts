'use server'

import { z } from 'zod'
import { getNutritionHistoryV2ForWeb } from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'
import { groupHistoryDaysByWeek, type HistoryWeekBucket } from '../_components/week-nav.logic'

/**
 * Siguiente tanda de semanas del historial del propio alumno — paginación ACUMULATIVA (SPEC ola 3
 * punto 7): el cliente AGREGA estas semanas a las ya pintadas, nunca reemplaza el listado. Reusa
 * el MISMO RPC de solo-lectura que la carga inicial (`get_nutrition_history_page_v2`, jamás
 * `get_nutrition_today_v2`) y el mismo agrupador puro (`groupHistoryDaysByWeek`) que la página.
 *
 * Autorización idéntica a `favorites.actions.ts`: re-verifica sesión + que `clientId` sea el
 * propio `auth.uid()` + el canary de rollout, para que esta action no sea una puerta trasera al
 * historial de otro alumno ni a un usuario fuera de la nueva experiencia.
 */

type Fail = { ok: false; error: string }

const PageSchema = z.object({
  clientId: z.string().uuid(),
  before: z.string().nullable(),
  pageSize: z.number().int().positive().max(60),
  todayIso: z.string().date(),
})

export async function fetchNutritionHistoryWeeksAction(
  input: unknown,
): Promise<{ ok: true; weeks: HistoryWeekBucket[]; hasMore: boolean; nextCursor: string | null } | Fail> {
  const parsed = PageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const { clientId, before, pageSize, todayIso } = parsed.data

  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user || !hasClientRow) return { ok: false, error: 'Debes iniciar sesión.' }
  if (user.id !== clientId) return { ok: false, error: 'La cuenta no coincide.' }

  const scope = await getClientScope(user.id)
  const enabled = await isNutritionV2Enabled({
    surface: 'webStudent',
    userId: user.id,
    clientId: user.id,
    coachId: scope.coachId,
    teamId: scope.teamId,
    orgId: scope.orgId,
  })
  if (!enabled) return { ok: false, error: 'La nueva experiencia de nutrición no está habilitada.' }

  const page = await getNutritionHistoryV2ForWeb({ clientId, before, pageSize })
  return {
    ok: true,
    weeks: groupHistoryDaysByWeek(page.items, todayIso),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  }
}
