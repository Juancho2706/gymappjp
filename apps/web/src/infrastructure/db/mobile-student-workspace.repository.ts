import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type MobileStudentCoachRow = {
    id: string
    slug: string
}

export type MobileStudentClientRow = {
    id: string
    force_password_change: boolean
    is_active: boolean
    is_archived: boolean
}

export type MobileStudentOrgCoachRow = {
    id: string
    organizations: { name: string | null } | { name: string | null }[] | null
}

export type MobileStudentWorkspaceRepositoryResult<T> = {
    data: T | null
    error: string | null
}

export async function findMobileStudentCoach(
    db: DB,
    coachId: string,
): Promise<MobileStudentWorkspaceRepositoryResult<MobileStudentCoachRow>> {
    const { data, error } = await db
        .from('coaches')
        .select('id, slug')
        .eq('id', coachId)
        .maybeSingle()

    return {
        data: (data ?? null) as MobileStudentCoachRow | null,
        error: error?.message ?? null,
    }
}

export async function findMobileStudentClient(
    db: DB,
    clientId: string,
): Promise<MobileStudentWorkspaceRepositoryResult<MobileStudentClientRow>> {
    const { data, error } = await db
        .from('clients')
        .select('id, force_password_change, is_active, is_archived')
        .eq('id', clientId)
        .maybeSingle()

    return {
        data: (data ?? null) as MobileStudentClientRow | null,
        error: error?.message ?? null,
    }
}

/**
 * Bypass de RLS deliberado y mínimo: confirma que el coach solicitado tiene membresía activa en
 * la organización del alumno. El caller ya fijó orgId desde la membresía activa del bearer.
 */
export async function findActiveMobileStudentOrgCoach(
    db: DB,
    orgId: string,
    coachId: string,
): Promise<MobileStudentWorkspaceRepositoryResult<MobileStudentOrgCoachRow>> {
    const { data, error } = await db
        .from('organization_members')
        .select('id, organizations(name)')
        .eq('org_id', orgId)
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    return {
        data: (data ?? null) as MobileStudentOrgCoachRow | null,
        error: error?.message ?? null,
    }
}
