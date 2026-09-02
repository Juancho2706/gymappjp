import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { hasModule } from '@/services/entitlements.service'
import { NUTRITION_EXCHANGES_MODULE } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'
import { shouldSwapCockpitToNutritionV2 } from '../_lib/nutrition-v2-swap'

export const metadata: Metadata = { title: 'Nutrición Pro' }

/**
 * Superficie directa del módulo `nutrition_exchanges` (plan 05 F5.7). El editor de
 * intercambios vive DENTRO del builder de cada plan (degrada solo si el módulo está OFF);
 * esta ruta existe para que una URL directa al módulo apagado muestre un aviso AMABLE hacia
 * el catálogo en vez de un error seco. Con el módulo ON, redirige al hub de planes (donde se
 * activa el modo intercambios por alumno).
 *
 * Gating server-side por workspace activo (team manda; standalone usa flags del coach).
 */
export default async function NutritionExchangesPage() {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(user.id)
    if (workspace?.type === 'enterprise_coach') return <ModuleOffNotice moduleKey="nutrition_exchanges" />
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const enabled = await hasModule(supabase, NUTRITION_EXCHANGES_MODULE, {
        teamId: activeTeamId,
        coachId: activeTeamId ? null : user.id,
    })
    if (!enabled) return <ModuleOffNotice moduleKey="nutrition_exchanges" />

    // Módulo ON: el modo intercambios se activa por alumno dentro del builder del plan. Standalone
    // y Team van DIRECTO al Centro V2 (el hub V1 los reboteria igual: un solo salto, no dos).
    redirect(
        (await shouldSwapCockpitToNutritionV2(user.id))
            ? '/coach/nutrition-v2'
            : '/coach/nutrition-plans',
    )
}
