import type { ActiveWorkspace } from '@/domain/auth/types'

export type WorkspaceRouteDecision = {
    allowed: boolean
    reason?: string
    redirectTo?: string
}

export function canAccessWorkspacePath(workspace: ActiveWorkspace, pathname: string): WorkspaceRouteDecision {
    if (pathname.startsWith('/org/')) {
        if (workspace.type === 'enterprise_staff') return { allowed: true }
        return { allowed: false, reason: 'org_routes_require_enterprise_staff', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/coach/subscription')) {
        if (workspace.type === 'coach_standalone') return { allowed: true }
        return { allowed: false, reason: 'billing_requires_coach_standalone', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/coach/settings')) {
        if (workspace.type === 'coach_standalone') return { allowed: true }
        return { allowed: false, reason: 'brand_settings_require_coach_standalone', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/coach/')) {
        if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach') return { allowed: true }
        return { allowed: false, reason: 'coach_routes_require_coach_workspace', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/c/')) {
        if (workspace.type === 'student_standalone' || workspace.type === 'student_enterprise') return { allowed: true }
        return { allowed: false, reason: 'student_routes_require_student_workspace', redirectTo: defaultWorkspaceHome(workspace) }
    }

    return { allowed: true }
}

export function defaultWorkspaceHome(workspace: ActiveWorkspace): string {
    if (workspace.type === 'enterprise_staff') return '/org'
    if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach') return '/coach/dashboard'
    return '/login'
}
