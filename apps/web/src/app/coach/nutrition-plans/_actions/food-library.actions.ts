'use server'

import type { FoodLibraryOptions } from '../_data/nutrition-coach.queries'
import { getFoodLibrary } from '../_data/nutrition-coach.queries'
import { createClient } from '@/lib/supabase/server'
import { resolveCoachScope } from '@/services/auth/coach-scope.service'

export async function searchCoachFoodLibrary(coachId: string, options: FoodLibraryOptions = {}) {
  // Fase 2C: org scope resolved server-side from the active workspace (never trust the client).
  const scope = await resolveCoachScope(await createClient(), coachId)
  return getFoodLibrary(coachId, { ...options, orgId: scope.ok ? scope.orgId : null })
}
