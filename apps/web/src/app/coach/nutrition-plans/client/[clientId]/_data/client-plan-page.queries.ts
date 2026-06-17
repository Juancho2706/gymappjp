import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export const getClientNutritionPlanPageAuthData = cache(async (clientId: string) => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, client: null, intake: null, orgId: null, activeTeamId: null }
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // Acceso por workspace ACTIVO (separación estricta): team ⇒ alumnos de ESE pool
    // (colaborativo, sin filtro coach_id; RLS techo); standalone ⇒ propios NO-pool; enterprise ⇒ org.
    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, coach_id, org_id')
        .eq('id', clientId)
    if (activeTeamId) {
        clientQuery = clientQuery.eq('team_id', activeTeamId).is('org_id', null)
    } else {
        clientQuery = clientQuery.eq('coach_id', user.id)
        clientQuery = orgId ? clientQuery.eq('org_id', orgId) : clientQuery.is('org_id', null)
        if (!orgId) clientQuery = clientQuery.is('team_id', null)
    }

    const [{ data: client }, { data: intake }] = await Promise.all([
        clientQuery.maybeSingle(),
        supabase.from('client_intake').select('weight_kg, height_cm').eq('client_id', clientId).maybeSingle(),
    ])

    return { user, client, intake, orgId, activeTeamId }
})

/** Nombre visible de un coach (para el badge de awareness del pool). RLS: los miembros del team se ven entre sí. */
export const getCoachDisplayName = cache(async (coachId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('full_name, brand_name')
        .eq('id', coachId)
        .maybeSingle()
    return data ? (data.full_name || data.brand_name || 'Otro coach') : null
})
