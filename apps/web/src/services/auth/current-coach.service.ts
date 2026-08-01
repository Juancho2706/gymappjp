import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Session identity used by coach-only domains. It intentionally has no dependency on a route
 * tree, so Nutrition V2 can stay independent from legacy Nutrition V1 pages/queries.
 */
export const getCurrentCoachSession = cache(async () => {
  const supabase = await createClient()
  // getClaims() verifies the JWT locally; the proxy has already refreshed the browser session.
  const { data: claims } = await supabase.auth.getClaims()
  const user = claims?.claims?.sub ? { id: claims.claims.sub as string } : null
  if (!user) return { user: null, coach: null }

  const { data: coach } = await supabase
    .from('coaches')
    .select('subscription_tier, active_org_id')
    .eq('id', user.id)
    .maybeSingle()

  return { user, coach }
})
