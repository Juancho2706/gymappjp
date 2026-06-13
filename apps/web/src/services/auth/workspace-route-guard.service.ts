import type { ActiveWorkspace, WorkspaceSummary } from '@/domain/auth/types'

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

    // El preview de la app del alumno es de la marca PERSONAL: solo standalone.
    if (pathname.startsWith('/coach/settings/preview')) {
        if (workspace.type === 'coach_standalone') return { allowed: true }
        return { allowed: false, reason: 'brand_preview_requires_coach_standalone', redirectTo: defaultWorkspaceHome(workspace) }
    }

    // C (Settings hub): /coach/settings es CONTEXT-AWARE — standalone ve Mi Marca completa;
    // coach_team ve el hub del team (Módulos + Mi Equipo + cuenta). La página decide el contenido.
    // /coach/settings/modules incluido (el owner/co-gestor del team edita los toggles del pool).
    if (pathname.startsWith('/coach/settings')) {
        if (workspace.type === 'coach_standalone' || workspace.type === 'coach_team') return { allowed: true }
        return { allowed: false, reason: 'settings_require_coach_workspace', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/coach/')) {
        if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach' || workspace.type === 'coach_team') return { allowed: true }
        return { allowed: false, reason: 'coach_routes_require_coach_workspace', redirectTo: defaultWorkspaceHome(workspace) }
    }

    if (pathname.startsWith('/c/')) {
        if (workspace.type === 'student_standalone' || workspace.type === 'student_enterprise' || workspace.type === 'student_team') return { allowed: true }
        return { allowed: false, reason: 'student_routes_require_student_workspace', redirectTo: defaultWorkspaceHome(workspace) }
    }

    return { allowed: true }
}

export function defaultWorkspaceHome(workspace: ActiveWorkspace | WorkspaceSummary): string {
    if (workspace.type === 'enterprise_staff') return 'slug' in workspace && workspace.slug ? `/org/${workspace.slug}` : '/org/login'
    if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach' || workspace.type === 'coach_team') return '/coach/dashboard'
    if (workspace.type === 'student_team') return 'slug' in workspace && workspace.slug ? `/t/${workspace.slug}/dashboard` : '/login'
    if ('slug' in workspace && workspace.slug) return `/c/${workspace.slug}/dashboard`
    return '/login'
}
