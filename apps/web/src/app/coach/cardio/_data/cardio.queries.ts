import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'
import {
    getCardioClientForCoach,
    listCardioClients,
} from '@/services/cardio-zones.service'
import type { CardioProfileRow } from '@/infrastructure/db/cardio-profile.repository'

export interface CardioPageScope {
    coachId: string
    activeTeamId: string | null
}

export type CardioPageData =
    | { status: 'unauthenticated' }
    | { status: 'module_off' }
    | { status: 'ok'; scope: CardioPageScope; clients: CardioProfileRow[] }

/**
 * Datos del módulo /coach/cardio. Gating SERVER-SIDE: assertModule('cardio') por el
 * workspace ACTIVO (team manda; standalone usa los flags del coach). Enterprise v1: OFF.
 */
export const getCardioPageData = cache(async (): Promise<CardioPageData> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type === 'enterprise_coach') return { status: 'module_off' }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    try {
        await assertModule(supabase, 'cardio', {
            teamId: activeTeamId,
            coachId: activeTeamId ? null : user.id,
        })
    } catch {
        return { status: 'module_off' }
    }

    const scope: CardioPageScope = { coachId: user.id, activeTeamId }
    const clients = await listCardioClients(supabase, scope)
    return { status: 'ok', scope, clients }
})

export type CardioClientData =
    | { status: 'unauthenticated' }
    | { status: 'module_off' }
    | { status: 'not_found' }
    | { status: 'ok'; client: CardioProfileRow }

/** Perfil cardio de UN alumno para el editor del coach (mismo gating + scope 3-vías). */
export const getCardioClientData = cache(async (clientId: string): Promise<CardioClientData> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type === 'enterprise_coach') return { status: 'module_off' }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    try {
        await assertModule(supabase, 'cardio', {
            teamId: activeTeamId,
            coachId: activeTeamId ? null : user.id,
        })
    } catch {
        return { status: 'module_off' }
    }

    const client = await getCardioClientForCoach(supabase, clientId, { coachId: user.id, activeTeamId })
    if (!client) return { status: 'not_found' }
    return { status: 'ok', client }
})
