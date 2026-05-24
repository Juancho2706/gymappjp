import type { ActiveWorkspace, WorkspacePermission } from '@/domain/auth/types'

const ENTERPRISE_STAFF_PERMISSIONS: WorkspacePermission[] = [
    'org.dashboard.view',
    'org.team.manage',
    'org.brand.manage',
    'org.audit.view',
    'org.billing.view',
]

const ENTERPRISE_COACH_PERMISSIONS: WorkspacePermission[] = [
    'coach.dashboard.view',
    'coach.clients.manage',
]

const COACH_STANDALONE_PERMISSIONS: WorkspacePermission[] = [
    'coach.dashboard.view',
    'coach.clients.manage',
    'coach.brand.manage',
    'coach.billing.view',
]

const STUDENT_PERMISSIONS: WorkspacePermission[] = [
    'student.dashboard.view',
]

export function workspaceCan(workspace: ActiveWorkspace, permission: WorkspacePermission): boolean {
    return workspacePermissions(workspace).includes(permission)
}

export function workspacePermissions(workspace: ActiveWorkspace): WorkspacePermission[] {
    if (workspace.type === 'enterprise_staff') return ENTERPRISE_STAFF_PERMISSIONS
    if (workspace.type === 'enterprise_coach') return ENTERPRISE_COACH_PERMISSIONS
    if (workspace.type === 'coach_standalone') return COACH_STANDALONE_PERMISSIONS
    return STUDENT_PERMISSIONS
}

export function assertWorkspaceCan(workspace: ActiveWorkspace, permission: WorkspacePermission): void {
    if (!workspaceCan(workspace, permission)) {
        throw new Error(`Workspace ${workspace.type} cannot ${permission}`)
    }
}
