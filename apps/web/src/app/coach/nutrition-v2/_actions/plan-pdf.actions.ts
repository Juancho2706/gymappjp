'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'
import { resolveBrandLogoDataUrlServer } from '@/lib/nutrition-pdf-logo.server'
import { resolveCoachScope } from '@/services/auth/coach-scope.service'
import { getExchangeListForGroup } from '@/services/nutrition-exchanges/exchange-lists.service'
import { getCoachPdfBrand } from '@/app/coach/nutrition-plans/_data/exchange.queries'
import type { PlanPdfAssetsResult } from '@/components/nutrition-v2/PlanPdfDownload'
import type { PlanPdfEquivalenceFood } from '@/lib/nutrition-v2-plan-pdf'

/**
 * Lo que el PDF de la pauta V2 necesita del servidor en la ficha del coach: la marca del workspace
 * activo (team ⇒ la del team; standalone ⇒ la del coach, con su sello si es Free), el logo ya en
 * dataURL (sin CORS) y la lista de equivalencias de los grupos que la pauta usa, resuelta con la
 * misma precedencia que ve el alumno. Lazy: corre solo al tocar «Descargar».
 *
 * Autorización: sesión propia y workspace del token, nunca del payload. Los grupos los filtra el
 * servicio (visibles para el actor) y la RLS de `exchange_group_foods`.
 */

const InputSchema = z.object({
    groupIds: z.array(z.guid()).max(40),
})

/** Tope por grupo: el PDF muestra 14 y avisa cuántos más hay. */
const FOODS_PER_GROUP = 60

export async function loadCoachPlanPdfAssetsAction(input: unknown): Promise<PlanPdfAssetsResult> {
    const parsed = InputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Solicitud inválida.' }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }

    const scope = await resolveCoachScope(supabase, user.id)
    if (!scope.ok) return { ok: false, error: scope.error }
    const workspaceScope = { orgId: scope.orgId, activeTeamId: scope.activeTeamId }

    try {
        const [{ brand, logoUrl }, lists] = await Promise.all([
            getCoachPdfBrand(user.id, workspaceScope),
            Promise.all(
                parsed.data.groupIds.map((groupId) =>
                    getExchangeListForGroup(supabase, {
                        actorCoachId: user.id,
                        scope: workspaceScope,
                        groupId,
                        limit: FOODS_PER_GROUP,
                    }),
                ),
            ),
        ])
        const equivalences: PlanPdfEquivalenceFood[] = lists.flatMap((result) =>
            result.success
                ? result.rows
                      .filter((row) => row.winner && !row.isExcluded)
                      .map((row) => ({
                          exchangeGroupId: row.exchangeGroupId,
                          name: row.foodName,
                          brand: row.foodBrand,
                          portionLabel: row.portionLabel,
                          portionGrams: row.portionGrams,
                      }))
                : [],
        )
        const logoDataUrl = brand.poweredByEva ? null : await resolveBrandLogoDataUrlServer(logoUrl)
        return { ok: true, brand, logoDataUrl, equivalences, todayIso: getTodayInSantiago().iso }
    } catch {
        return { ok: false, error: 'No pudimos preparar el PDF. Inténtalo de nuevo.' }
    }
}
