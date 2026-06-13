import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'
import {
    getClientMovementDetail,
    getMovementHubData,
    getMovementPrintData,
    getMovementWizardData,
    type MovementHubData,
} from '@/services/assessment/movement-assessment.service'

// _data del modulo movement_assessment: SIEMPRE via service -> repository (jamas
// Supabase directo). Gating server-side (assertModule + scope 3-vias) vive en el
// service; aca un fallo de gate/acceso se traduce a un status discriminado.

export type MovementHubResult =
    | { status: 'unauthenticated' }
    | { status: 'module_off' }
    | { status: 'ok'; data: MovementHubData }

/**
 * Hub del modulo: distingue module_off (aviso amable, plan 05 F5.7) de no-sesion. El gate
 * server-side (assertModule por workspace activo) sigue siendo el techo: si el modulo esta
 * apagado la page muestra ModuleOffNotice, no datos.
 */
export const getMovementHub = cache(async (): Promise<MovementHubResult> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    // Enterprise v1: modulo OFF (paridad con cardio). Team manda; standalone usa flags del coach.
    if (workspace?.type === 'enterprise_coach') return { status: 'module_off' }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    try {
        await assertModule(supabase, 'movement_assessment', {
            teamId: activeTeamId,
            coachId: activeTeamId ? null : user.id,
        })
    } catch {
        return { status: 'module_off' }
    }

    try {
        const data = await getMovementHubData(supabase, user.id)
        return { status: 'ok', data }
    } catch {
        // Fallo de scope/acceso tras pasar el gate del modulo => no exponemos datos.
        return { status: 'module_off' }
    }
})

export const getMovementClientReport = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getClientMovementDetail(supabase, user.id, clientId)
    } catch {
        return null
    }
})

export const getMovementWizard = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        const data = await getMovementWizardData(supabase, user.id, clientId)
        return { ...data, currentUserId: user.id }
    } catch {
        return null
    }
})

export const getMovementPrint = cache(async (clientId: string, assessmentId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getMovementPrintData(supabase, user.id, clientId, assessmentId)
    } catch {
        return null
    }
})
