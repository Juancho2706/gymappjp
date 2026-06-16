import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { isStudentMovementEnabled } from '@/services/assessment/movement-assessment.service'
import { isStudentBodyCompositionEnabled } from '@/services/bodycomp/body-composition.service'

/**
 * Contexto de pool/team detectable en Server Components: el proxy /t/[team_slug] reescribe a
 * /c/[coach_slug] y reenvía la marca del TEAM en headers (x-workspace-brand-source==='organization'
 * + x-client-base-path=/t/...). Sirve para no filtrar la marca/contacto PERSONAL del coach al
 * alumno de pool (la gestiona el dueño del team, no el coach asignado). Standalone => false.
 */
async function getTeamBrandContext() {
    const h = await headers()
    const basePath = h.get('x-client-base-path') ?? ''
    const isOrgSource = h.get('x-workspace-brand-source') === 'organization'
    const isTeam = isOrgSource || basePath.startsWith('/t')
    return { isTeam, teamBrandName: isTeam ? h.get('x-coach-brand-name') : null }
}

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

/**
 * Espejo del modulo body_composition para el nav del alumno (pool => su team; standalone => su
 * coach). Service-role SOLO para leer enabled_modules (RLS no deja al alumno leer teams/coaches);
 * el gate real es la page de bodycomp.
 */
export const getStudentBodyCompositionNavEnabled = cache(async () => {
    const user = await getClientRootUser()
    if (!user) return false
    const supabase = await createClient()
    try {
        return await isStudentBodyCompositionEnabled(supabase, createServiceRoleClient(), user.id)
    } catch {
        return false
    }
})

export const getSuspendedCoachData = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    // Reuse the shared auth root (cache()-deduped) instead of a second getUser() round-trip.
    const user = await getClientRootUser()
    if (!user) return { user: null, coach: null, isTeam: false }

    // Pool/team: la suspensión la gestiona el DUEÑO del team, no el coach asignado. Nunca
    // exponer brand_name/WhatsApp PERSONAL del coach al alumno de pool — usar la marca del team
    // (header del proxy) y sin contacto personal (los teams no tienen canal de soporte por columna).
    const { isTeam, teamBrandName } = await getTeamBrandContext()
    if (isTeam) {
        return {
            user,
            coach: { brand_name: teamBrandName || 'tu equipo', whatsapp: null } as { brand_name: string; whatsapp: string | null },
            isTeam: true,
        }
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, whatsapp')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return { user, coach: coach as { brand_name: string; whatsapp: string | null } | null, isTeam: false }
})
