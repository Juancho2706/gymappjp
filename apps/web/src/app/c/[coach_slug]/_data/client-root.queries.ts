import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { isStudentMovementEnabled } from '@/services/assessment/movement-assessment.service'

export const getClientRootUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
})

/**
 * Espejo del modulo movement_assessment para el nav del alumno (pool => su team;
 * standalone => su coach). Service-role SOLO para leer enabled_modules (RLS no
 * deja al alumno leer teams/coaches); el gate real es la page de movimiento.
 */
export const getStudentMovementNavEnabled = cache(async () => {
    const user = await getClientRootUser()
    if (!user) return false
    const supabase = await createClient()
    try {
        return await isStudentMovementEnabled(supabase, createServiceRoleClient(), user.id)
    } catch {
        return false
    }
})

export const getSuspendedCoachData = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null }

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, whatsapp')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return { user, coach: coach as { brand_name: string; whatsapp: string | null } | null }
})
