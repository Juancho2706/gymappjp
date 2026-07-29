'use server'

import { z } from 'zod'
import { getNutritionPlansPageCoach } from '@/app/coach/nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionCoachRosterV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

/**
 * NUT-026 — Búsqueda server-side del roster para los selectores de alumno del Centro V2.
 *
 * Antes los pickers recibían del RSC un array pre-paginado (8 páginas × 50) y filtraban
 * client-side: el alumno #401 era invisible e imbuscable, y el render encadenaba 8 RPC.
 * Ahora el picker escribe, esta action busca en TODO el workspace y devuelve una página.
 *
 * El scope NUNCA viene del cliente: se re-deriva del workspace activo de la sesión, y el RPC
 * scoped vuelve a validar la pertenencia de cada alumno contra `auth.uid()`.
 */

const InputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** Excluye al alumno fuente en el diálogo "Asignar a otros alumnos". */
  excludeClientId: z.string().uuid().optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export interface RosterSearchEntry {
  clientId: string
  clientName: string
  planStatus: string | null
}

export type RosterSearchResult =
  | { ok: true; items: RosterSearchEntry[]; hasMore: boolean }
  | { ok: false; error: string }

export async function searchCoachRosterAction(input: {
  search?: string
  excludeClientId?: string
  pageSize?: number
}): Promise<RosterSearchResult> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Búsqueda inválida.' }

  const { user } = await getNutritionPlansPageCoach()
  if (!user) return { ok: false, error: 'Debes iniciar sesión.' }

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) return { ok: false, error: 'La nueva experiencia de nutrición no está habilitada.' }

  try {
    const scope = nutritionV2CoachScopeFromWorkspace(workspace)
    const page = await getNutritionCoachRosterV2ForWeb({
      scope,
      search: parsed.data.search ?? null,
      pageSize: parsed.data.pageSize ?? 50,
    })
    const items = page.items
      .filter((item) => item.clientId !== parsed.data.excludeClientId)
      .map((item) => ({
        clientId: item.clientId,
        clientName: item.clientName ?? 'Alumno',
        planStatus: item.planStatus,
      }))
    return { ok: true, items, hasMore: page.hasMore }
  } catch {
    return { ok: false, error: 'No pudimos buscar alumnos. Intenta de nuevo.' }
  }
}
