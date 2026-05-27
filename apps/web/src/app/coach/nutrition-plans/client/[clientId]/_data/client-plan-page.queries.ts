import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export const getClientNutritionPlanPageAuthData = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, intake: null }
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, coach_id, org_id')
        .eq('id', clientId)
        .eq('coach_id', user.id)
    clientQuery = orgId ? clientQuery.eq('org_id', orgId) : clientQuery.is('org_id', null)

    const [{ data: client }, { data: intake }] = await Promise.all([
        clientQuery.maybeSingle(),
        supabase.from('client_intake').select('weight_kg, height_cm').eq('client_id', clientId).maybeSingle(),
    ])

    return { user, client, intake, orgId }
})
