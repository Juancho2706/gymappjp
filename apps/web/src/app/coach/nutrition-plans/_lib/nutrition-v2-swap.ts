import 'server-only'

import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'

/**
 * Redirección temporal del cockpit legacy: standalone y Team usan V2; Enterprise conserva V1
 * hasta su proyecto de retiro independiente. No depende de Edge Config ni de flags de rollout.
 */
export async function shouldSwapCockpitToNutritionV2(coachId: string): Promise<boolean> {
  const workspace = await getPreferredWorkspaceForRender(coachId)
  return workspace?.type === 'coach_standalone' || workspace?.type === 'coach_team'
}
