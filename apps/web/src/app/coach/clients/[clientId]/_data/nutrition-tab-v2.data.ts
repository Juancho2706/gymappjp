import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
    getNutritionClientDetailV2ForWeb,
    nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import {
    filterHistoryDaysToBaseWindow,
    hasNutritionProV2,
    nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
    buildNutritionTabV2ViewModel,
    type NutritionTabV2ViewModel,
} from '../nutritionTabV2.logic'

/**
 * Resuelve el resumen de Nutrición V2 del tab "Nutrición" de la ficha del alumno.
 *
 * Poda 2026-07-29 (docs/specs/nutrition-ui-poda/SPEC.md, decisión del owner "V1 al olvido"):
 * ya NO hay canary ni swap en esta superficie. El tab es SIEMPRE V2 — se retiró
 * `isNutritionV2Enabled({ surface: 'webCoach' })` de este camino porque su única razón de ser
 * era caer a `NutritionTabB5` (V1), que dejó de existir. El rollback por Edge Config de las
 * superficies del ALUMNO (`webStudent`) queda intacto: este resolver no lo consulta.
 *
 * Vive en `_data/` (no en la page) porque lo consumen DOS superficies con la misma ficha:
 * la ruta standalone `/coach/clients/[clientId]` y el panel derecho del master-detail de
 * Alumnos (`_data/ficha-panel.data.ts` → `CoachFichaPanel`). Antes solo la standalone
 * resolvía el view model, así que el panel del master-detail mostraba V1 SIEMPRE.
 *
 * Todo va envuelto en try/catch: un fallo del workspace o de la lectura scoped JAMÁS puede
 * tumbar la ficha completa. `null` ⇒ el tab pinta su estado degradado
 * (`NutritionTabV2Unavailable`) con el CTA a la ficha de nutrición.
 */
export async function resolveNutritionTabV2(
    clientId: string,
): Promise<NutritionTabV2ViewModel | null> {
    try {
        const supabase = await createClient()
        const { data: claimsData } = await supabase.auth.getClaims()
        const userId = claimsData?.claims?.sub as string | undefined
        if (!userId) return null

        const workspace = await getPreferredWorkspaceForRender(userId)

        // El scope propaga el workspace activo: el RPC scoped niega (42501) un alumno fuera del pool.
        const scope = nutritionV2CoachScopeFromWorkspace(workspace)
        const { iso: today } = getTodayInSantiago()
        const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })

        // Sin addon Pro, el histórico del alumno para el coach se limita a la ventana base (~30d).
        const nutritionProEnabled = await hasNutritionProV2(
            supabase,
            nutritionProCtxFromWorkspace(userId, workspace),
        )
        const recentDaysForDisplay = nutritionProEnabled
            ? detail.recentDays
            : filterHistoryDaysToBaseWindow(detail.recentDays, today)

        return buildNutritionTabV2ViewModel({
            clientId,
            detail,
            todayIso: today,
            recentDaysForDisplay,
        })
    } catch (error) {
        console.error('nutrition_v2_ficha_tab_resolve_failed', {
            clientId,
            error: error instanceof Error ? error.message : String(error),
        })
        return null
    }
}
