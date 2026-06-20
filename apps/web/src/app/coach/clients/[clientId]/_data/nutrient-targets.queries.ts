import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  NutrientTargetsService,
  type NutrientTargetRow,
} from '@/services/nutrient-targets.service'

/**
 * Queries del COACH para umbrales de micronutrientes (feature A-base).
 * React.cache → dedupe por request. RLS hace cumplir coach↔alumno; el `coachId`
 * proviene de la sesión (getClaims), nunca del body.
 *
 * Devuelve los targets específicos del alumno + los defaults del coach
 * (client_id null), para que la UI haga el merge (CoachNutrientTargetsEditor).
 */
export const getCoachNutrientTargets = cache(
  async (clientId: string): Promise<NutrientTargetRow[]> => {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = (claims?.claims?.sub as string | undefined) ?? null
    if (!coachId) return []
    const service = new NutrientTargetsService(supabase)
    return service.listNutrientTargets(coachId, clientId)
  }
)
