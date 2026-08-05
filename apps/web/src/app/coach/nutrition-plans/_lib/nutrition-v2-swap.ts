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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Destino V2 para el editor de un alumno. Las sub-rutas V1 son alcanzables por deep-link con
 * cualquier segmento, así que solo interpolamos el id cuando PARECE uuid; con basura caemos al
 * Centro V2 en vez de fabricar una URL que reventaría el read del alumno.
 */
export function nutritionV2ClientPath(clientId: string | null | undefined): string {
  return clientId && UUID_RE.test(clientId)
    ? `/coach/nutrition-v2/${clientId}`
    : '/coach/nutrition-v2'
}
