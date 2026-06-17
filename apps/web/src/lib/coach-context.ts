import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { CoachOrgContext } from '@/domain/coach/types'
export type { CoachOrgContext } from '@/domain/coach/types'

/**
 * Extracts org context from the JWT custom claims injected by the auth hook.
 * Falls back to a DB query if claims are absent (e.g., token not yet refreshed).
 */
export const getCoachOrgContext = cache(async (): Promise<CoachOrgContext | null> => {
    const supabase = await createClient()
    // getClaims(): verificación LOCAL del JWT (llaves asimétricas ES256), sin round-trip a GoTrue
    // /user. Esto es contexto de routing/entitlement (lectura), no un boundary de mutación.
    const { data } = await supabase.auth.getClaims()
    const jwt = data?.claims
    if (!jwt?.sub) return null
    const userId = jwt.sub

    const claims = ((jwt as { app_metadata?: Record<string, unknown> }).app_metadata ?? {}) as {
        coach_id?: string
        org_id?: string
        org_role?: string
        is_org_user?: boolean
    }

    if (claims.is_org_user && claims.org_id) {
        const orgRole = (claims.org_role ?? null) as CoachOrgContext['orgRole']
        return {
            coachId: null,
            orgId: claims.org_id,
            orgRole,
            isOrgMember: true,
            isOrgAdmin: orgRole === 'org_owner' || orgRole === 'org_admin',
            isOrgUser: true,
        }
    }

    if (claims.coach_id) {
        const orgId = claims.org_id ?? null
        const orgRole = (claims.org_role ?? null) as CoachOrgContext['orgRole']
        return {
            coachId: claims.coach_id,
            orgId,
            orgRole,
            isOrgMember: !!orgId,
            isOrgAdmin: orgRole === 'org_owner' || orgRole === 'org_admin',
            isOrgUser: false,
        }
    }

    // Fallback: DB query (token not yet refreshed after hook activation)
    const { data: coach } = await supabase
        .from('coaches')
        .select('id, active_org_id')
        .eq('id', userId)
        .maybeSingle()

    if (!coach) return null

    let orgRole: CoachOrgContext['orgRole'] = null
    if (coach.active_org_id) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('role')
            .eq('org_id', coach.active_org_id)
            .eq('user_id', coach.id)
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle()
        orgRole = (membership?.role ?? null) as CoachOrgContext['orgRole']
    }

    return {
        coachId: coach.id,
        orgId: coach.active_org_id ?? null,
        orgRole,
        isOrgMember: !!coach.active_org_id,
        isOrgAdmin: orgRole === 'org_owner' || orgRole === 'org_admin',
        isOrgUser: false,
    }
})
