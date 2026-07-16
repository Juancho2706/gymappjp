import 'server-only'

import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

/**
 * Decisión server-side del swap del cockpit de nutrición del coach hacia V2, bajo canary.
 *
 * Reversible por flag: usa EXACTAMENTE el mismo gate (`isNutritionV2Enabled`, surface
 * `webCoach`) y la misma forma de contexto que consume el hub V2
 * (`apps/web/src/app/coach/nutrition-v2/page.tsx`). Como el hub V2 redirige de vuelta a
 * `/coach/nutrition-plans` cuando el gate está OFF, y aquí redirigimos a `/coach/nutrition-v2`
 * cuando está ON, la decisión es consistente y NO forma un loop de redirects:
 *  - ON  → nutrition-plans redirige a v2; v2 renderiza (gate ON).
 *  - OFF → nutrition-plans renderiza V1; v2 redirige a nutrition-plans (gate OFF).
 *
 * Fuera de canary la página V1 queda intacta (retorna false ⇒ sin redirect).
 */
export async function shouldSwapCockpitToNutritionV2(coachId: string): Promise<boolean> {
  const workspace = await getPreferredWorkspaceForRender(coachId)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

  return isNutritionV2Enabled({
    surface: 'webCoach',
    userId: coachId,
    coachId,
    teamId,
    orgId,
  })
}
