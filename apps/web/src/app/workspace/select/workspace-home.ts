import type { WorkspaceSummary } from '@/domain/auth/types'

export function workspaceHome(workspace: WorkspaceSummary): string {
    if (workspace.type === 'enterprise_staff') return workspace.slug ? `/org/${workspace.slug}` : '/org/login'
    if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach' || workspace.type === 'coach_team') return '/coach/dashboard'
    // Alumno de pool: entra por el área del team (/t/[slug]); el proxy reescribe a /c con marca del team.
    if (workspace.type === 'student_team') return workspace.slug ? `/t/${workspace.slug}/dashboard` : '/login'
    if (workspace.slug) return `/c/${workspace.slug}/dashboard`
    return '/login'
}
