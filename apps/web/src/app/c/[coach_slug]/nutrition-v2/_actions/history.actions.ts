'use server'

import { z } from 'zod'
import { getNutritionHistoryV2ForWeb } from '@/services/nutrition-v2-read.service'
import {
  getCurrentStudentNutritionScope,
  getCurrentStudentNutritionSession,
} from '@/services/auth/current-student-nutrition.service'
import {
  groupHistoryDaysByWeek,
  trimHistoryWeeksPage,
  type HistoryWeekBucket,
} from '../_components/week-nav.logic'

/**
 * Siguiente tanda de semanas del historial del propio alumno — paginación ACUMULATIVA (SPEC ola 3
 * punto 7): el cliente AGREGA estas semanas a las ya pintadas, nunca reemplaza el listado. Reusa
 * el MISMO RPC de solo-lectura que la carga inicial (`get_nutrition_history_page_v2`, jamás
 * `get_nutrition_today_v2`) y el mismo agrupador puro (`groupHistoryDaysByWeek`) que la página.
 *
 * Autorización idéntica a `favorites.actions.ts`: re-verifica sesión + que `clientId` sea el
 * propio `auth.uid()` + workspace standalone/Team, para que esta action no sea una puerta trasera
 * al historial de otro alumno ni a Enterprise mientras esa superficie siga aislada.
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

  const { user, hasClientRow } = await getCurrentStudentNutritionSession()
  if (!user || !hasClientRow) return { ok: false, error: 'Debes iniciar sesión.' }
  if (user.id !== clientId) return { ok: false, error: 'La cuenta no coincide.' }

  const scope = await getCurrentStudentNutritionScope(user.id)
  if (scope.orgId) return { ok: false, error: 'Esta experiencia aún no está disponible para Enterprise.' }

  const page = await getNutritionHistoryV2ForWeb({ clientId, before, pageSize })
  // Borde de paginación (QA H3): mismo recorte que la carga inicial en `page.tsx` — la semana
  // más vieja de la tanda se descarta si puede venir cortada y la tanda siguiente la re-trae.
  const trimmed = trimHistoryWeeksPage({
    weeks: groupHistoryDaysByWeek(page.items, todayIso),
    hasMore: page.hasMore,
    rpcCursor: page.nextCursor,
  })
  return { ok: true, weeks: trimmed.weeks, hasMore: trimmed.hasMore, nextCursor: trimmed.nextCursor }
}
