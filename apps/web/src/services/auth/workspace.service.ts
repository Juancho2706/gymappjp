import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkspace, EnterpriseStaffRole, WorkspaceSummary } from '@/domain/auth/types'
import type { Database } from '@/lib/database.types'
import { ENTERPRISE_STAFF_ROLES } from '@/domain/org/permissions'
import {
    findWorkspaceIdentityRows,
    findWorkspacePreference,
    upsertWorkspacePreference,
    type WorkspacePreferenceRow,
} from '@/infrastructure/db/workspace.repository'
import { writeOrgAuditEvent } from '@/services/org/org.service'

type DB = SupabaseClient<Database>

const ENTERPRISE_STAFF_ROLE_SET = new Set<string>(ENTERPRISE_STAFF_ROLES)

function asEnterpriseStaffRole(role: string): EnterpriseStaffRole {
    if (ENTERPRISE_STAFF_ROLE_SET.has(role)) return role as EnterpriseStaffRole
    return 'org_admin'
}

export async function listUserWorkspaces(db: DB, userId: string): Promise<WorkspaceSummary[]> {
    const { coach, client, members, teams, clientTeam, orgs, coaches } = await findWorkspaceIdentityRows(db, userId)
    const orgById = new Map(orgs.map(org => [org.id, org]))
    const coachById = new Map(coaches.map(row => [row.id, row]))

    const workspaces: WorkspaceSummary[] = []

    // org_managed (enterprise) y team_managed (pool) NO tienen identidad standalone: su workspace
    // es el enterprise/team respectivo, no un standalone fantasma.
    if (coach && coach.subscription_status !== 'org_managed' && coach.subscription_status !== 'team_managed') {
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
        } else if (ENTERPRISE_STAFF_ROLE_SET.has(member.role)) {
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

    // Team (pool) workspaces — un coach puede ser standalone + enterprise + team a la vez.
    for (const team of teams) {
        workspaces.push({
            type: 'coach_team',
            userId,
            coachId: coach?.id ?? userId,
            teamId: team.teamId,
            label: `${team.name} - Equipo`,
            brandName: team.name,
            slug: team.slug,
        })
    }

    if (client?.org_id) {
        const org = orgById.get(client.org_id)
        const clientCoach = client.coach_id ? coachById.get(client.coach_id) : null
        workspaces.push({
            type: 'student_enterprise',
            userId,
            clientId: client.id,
            orgId: client.org_id,
            coachId: client.coach_id,
            label: org ? `Entrenar con ${org.name}` : 'Alumno enterprise',
            brandName: org?.name ?? null,
            slug: clientCoach?.slug ?? null,
        })
    } else if (client?.team_id && clientTeam) {
        // Alumno de pool (clients.team_id): workspace del team, rutea a /t/[slug].
        workspaces.push({
            type: 'student_team',
            userId,
            clientId: client.id,
            teamId: client.team_id,
            label: `Entrenar con ${clientTeam.name}`,
            brandName: clientTeam.name,
            slug: clientTeam.slug,
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

/**
 * P1.2: alumno workspaces from `client_memberships` (the identity-split source of truth) —
 * one entry per active membership (standalone / per-org). Lets a single account participate in
 * BOTH worlds and powers the alumno workspace selector + the `/e/[org_slug]` area.
 *
 * Backward-compatible: if no memberships exist yet for the account (pre-backfill edge), falls
 * back to the legacy `clients`-row logic in listUserWorkspaces. Does NOT touch the coach hot path.
 */
export async function listClientWorkspaces(db: DB, userId: string): Promise<WorkspaceSummary[]> {
    const { data: memberships } = await db
        .from('client_memberships')
        .select('scope, org_id, coach_id, client_id, team_id, organizations(name, slug), coaches(slug, brand_name, full_name), teams(name, slug)')
        .eq('account_id', userId)
        .eq('status', 'active')
        .is('deleted_at', null)

    if (!memberships || memberships.length === 0) {
        // Fallback: derive from the legacy clients row (back-compat for un-backfilled accounts).
        return (await listUserWorkspaces(db, userId)).filter(
            w => w.type === 'student_standalone' || w.type === 'student_enterprise',
        )
    }

    const out: WorkspaceSummary[] = []
    for (const m of memberships) {
        const org = m.organizations as unknown as { name: string | null; slug: string | null } | null
        const coach = m.coaches as unknown as { slug: string | null; brand_name: string | null; full_name: string | null } | null
        if (m.scope === 'enterprise' && m.org_id) {
            out.push({
                type: 'student_enterprise',
                userId,
                clientId: m.client_id,
                orgId: m.org_id,
                coachId: m.coach_id,
                label: org?.name ? `Entrenar con ${org.name}` : 'Alumno enterprise',
                brandName: org?.name ?? null,
                slug: coach?.slug ?? null,
            })
        } else if (m.scope === 'standalone' && m.coach_id) {
            out.push({
                type: 'student_standalone',
                userId,
                clientId: m.client_id,
                coachId: m.coach_id,
                label: `Entrenar con ${coach?.brand_name || coach?.full_name || 'mi coach'}`,
                brandName: coach?.brand_name || coach?.full_name || null,
                slug: coach?.slug ?? null,
            })
        } else if (m.scope === 'team' && m.team_id) {
            const team = m.teams as unknown as { name: string | null; slug: string | null } | null
            out.push({
                type: 'student_team',
                userId,
                clientId: m.client_id,
                teamId: m.team_id,
                label: team?.name ? `Entrenar con ${team.name}` : 'Alumno del equipo',
                brandName: team?.name ?? null,
                slug: team?.slug ?? null,
            })
        }
    }
    return dedupeWorkspaces(out)
}

/**
 * Decisión PURA: dado el set de workspaces y la preferencia, ¿cuál es el activo?
 * Extraída para testear sin DB (el codebase testea funciones puras). Reglas:
 *  - 0 workspaces -> null
 *  - 1 workspace  -> ese (isLastUsed)
 *  - N sin preferencia -> null (el caller muestra el selector)
 *  - N con preferencia que matchea -> ese; si no matchea ninguno -> null
 */
export function pickPreferredWorkspace(
    workspaces: WorkspaceSummary[],
    preference: WorkspacePreferenceRow | null
): WorkspaceSummary | null {
    if (workspaces.length === 0) return null
    if (workspaces.length === 1) return { ...workspaces[0], isLastUsed: true }
    if (!preference) return null

    const preferred = workspaces.find(workspace => workspaceMatchesPreference(workspace, preference))
    return preferred ? { ...preferred, isLastUsed: true } : null
}

export async function resolvePreferredWorkspace(db: DB, userId: string): Promise<WorkspaceSummary | null> {
    const [preference, workspaces] = await Promise.all([
        findWorkspacePreference(db, userId),
        listUserWorkspaces(db, userId),
    ])
    return pickPreferredWorkspace(workspaces, preference)
}

export async function setLastWorkspace(db: DB, workspace: ActiveWorkspace): Promise<{ error?: string }> {
    const previous = await findWorkspacePreference(db, workspace.userId)
    const result = await upsertWorkspacePreference(db, {
        user_id: workspace.userId,
        last_workspace_type: workspace.type,
        last_org_id: 'orgId' in workspace ? workspace.orgId : null,
        last_coach_id: 'coachId' in workspace ? workspace.coachId : null,
        last_client_id: 'clientId' in workspace ? workspace.clientId : null,
        updated_at: new Date().toISOString(),
    })

    if (result.error) return result
    await writeWorkspaceAuditEvent(db, workspace, previous)
    return {}
}

export function workspaceKey(workspace: ActiveWorkspace): string {
    if (workspace.type === 'coach_standalone') return `${workspace.type}:${workspace.coachId}`
    if (workspace.type === 'enterprise_coach') return `${workspace.type}:${workspace.orgId}:${workspace.coachId}`
    if (workspace.type === 'enterprise_staff') return `${workspace.type}:${workspace.orgId}:${workspace.memberId}`
    if (workspace.type === 'coach_team') return `${workspace.type}:${workspace.teamId}`
    if (workspace.type === 'student_team') return `${workspace.type}:${workspace.clientId}:${workspace.teamId}`
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

function workspaceMatchesPreference(workspace: ActiveWorkspace, preference: WorkspacePreferenceRow): boolean {
    if (workspace.type !== preference.last_workspace_type) return false
    if ('orgId' in workspace && workspace.orgId !== preference.last_org_id) return false
    if (!('orgId' in workspace) && preference.last_org_id) return false
    if ('coachId' in workspace && workspace.coachId !== preference.last_coach_id) return false
    if (!('coachId' in workspace) && preference.last_coach_id) return false
    if ('clientId' in workspace && workspace.clientId !== preference.last_client_id) return false
    if (!('clientId' in workspace) && preference.last_client_id) return false
    return true
}

async function writeWorkspaceAuditEvent(
    db: DB,
    workspace: ActiveWorkspace,
    previous: WorkspacePreferenceRow | null
): Promise<void> {
    if (!('orgId' in workspace) || !workspace.orgId) return
    if (previous && workspaceMatchesPreference(workspace, previous)) return

    await writeOrgAuditEvent(db, {
        orgId: workspace.orgId,
        actorId: workspace.userId,
        action: previous ? 'workspace.switched' : 'workspace.activated',
        targetType: 'workspace',
        targetId: workspace.orgId,
        metadata: {
            workspace_type: workspace.type,
            previous_workspace_type: previous?.last_workspace_type ?? null,
            previous_org_id: previous?.last_org_id ?? null,
            coach_id: 'coachId' in workspace ? workspace.coachId : null,
            client_id: 'clientId' in workspace ? workspace.clientId : null,
            member_id: 'memberId' in workspace ? workspace.memberId : null,
            source: 'setLastWorkspace',
        },
    })
}
