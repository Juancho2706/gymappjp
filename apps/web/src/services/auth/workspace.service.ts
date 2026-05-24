import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkspace, EnterpriseStaffRole, WorkspaceSummary } from '@/domain/auth/types'
import type { Database } from '@/lib/database.types'
import { findWorkspaceIdentityRows } from '@/infrastructure/db/workspace.repository'

type DB = SupabaseClient<Database>

const ENTERPRISE_STAFF_ROLES = new Set(['org_owner', 'org_admin', 'ops', 'analyst', 'brand_manager'])

function asEnterpriseStaffRole(role: string): EnterpriseStaffRole {
    if (ENTERPRISE_STAFF_ROLES.has(role)) return role as EnterpriseStaffRole
    return 'org_admin'
}

export async function listUserWorkspaces(db: DB, userId: string): Promise<WorkspaceSummary[]> {
    const { coach, client, members, orgs, coaches } = await findWorkspaceIdentityRows(db, userId)
    const orgById = new Map(orgs.map(org => [org.id, org]))
    const coachById = new Map(coaches.map(row => [row.id, row]))

    const workspaces: WorkspaceSummary[] = []

    if (coach && coach.subscription_status !== 'org_managed') {
        workspaces.push({
            type: 'coach_standalone',
            userId,
            coachId: coach.id,
            label: coach.brand_name || coach.full_name || 'Mi negocio EVA',
            brandName: coach.brand_name || coach.full_name,
            slug: coach.slug,
        })
    }

    for (const member of members) {
        const org = orgById.get(member.org_id)
        if (!org) continue

        if (member.role === 'coach' && member.coach_id) {
            const memberCoach = coachById.get(member.coach_id)
            workspaces.push({
                type: 'enterprise_coach',
                userId,
                orgId: member.org_id,
                coachId: member.coach_id,
                memberId: member.id,
                label: `${org.name} - Coach`,
                brandName: org.name,
                slug: org.slug,
            })
            if (!memberCoach) continue
        } else if (ENTERPRISE_STAFF_ROLES.has(member.role)) {
            workspaces.push({
                type: 'enterprise_staff',
                userId,
                orgId: member.org_id,
                memberId: member.id,
                role: asEnterpriseStaffRole(member.role),
                label: `${org.name} - Admin`,
                brandName: org.name,
                slug: org.slug,
            })
        }
    }

    if (client?.org_id) {
        const org = orgById.get(client.org_id)
        workspaces.push({
            type: 'student_enterprise',
            userId,
            clientId: client.id,
            orgId: client.org_id,
            coachId: client.coach_id,
            label: org ? `Entrenar con ${org.name}` : 'Alumno enterprise',
            brandName: org?.name ?? null,
            slug: org?.slug ?? null,
        })
    } else if (client?.coach_id) {
        const clientCoach = coachById.get(client.coach_id)
        workspaces.push({
            type: 'student_standalone',
            userId,
            clientId: client.id,
            coachId: client.coach_id,
            label: `Entrenar con ${clientCoach?.brand_name || clientCoach?.full_name || 'mi coach'}`,
            brandName: clientCoach?.brand_name || clientCoach?.full_name || null,
            slug: clientCoach?.slug ?? null,
        })
    }

    return dedupeWorkspaces(workspaces)
}

export function workspaceKey(workspace: ActiveWorkspace): string {
    if (workspace.type === 'coach_standalone') return `${workspace.type}:${workspace.coachId}`
    if (workspace.type === 'enterprise_coach') return `${workspace.type}:${workspace.orgId}:${workspace.coachId}`
    if (workspace.type === 'enterprise_staff') return `${workspace.type}:${workspace.orgId}:${workspace.memberId}`
    if (workspace.type === 'student_standalone') return `${workspace.type}:${workspace.clientId}:${workspace.coachId}`
    return `${workspace.type}:${workspace.clientId}:${workspace.orgId}`
}

function dedupeWorkspaces(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
    const seen = new Set<string>()
    const result: WorkspaceSummary[] = []
    for (const workspace of workspaces) {
        const key = workspaceKey(workspace)
        if (seen.has(key)) continue
        seen.add(key)
        result.push(workspace)
    }
    return result
}
