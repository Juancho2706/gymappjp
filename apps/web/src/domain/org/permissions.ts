export type OrgRole = 'org_owner' | 'org_admin' | 'ops' | 'analyst' | 'brand_manager' | 'coach'

/**
 * Granular permissions for enterprise org roles.
 * Follows least-privilege principle from B2B SaaS RBAC research 2026.
 *
 * Role matrix (simplified):
 *   org_owner    — everything (owner-level: settings, billing, team modify)
 *   org_admin    — full operational + team manage, no owner settings
 *   ops          — coaches/clients/assignments + view payments/reports/audit
 *   analyst      — read-only: dashboard, clients, reports, payments
 *   brand_manager— brand studio only + view dashboard
 *   coach        — no /org/* access (enterprise coach, not staff)
 */
export type OrgPermission =
    // Dashboard
    | 'org.dashboard.view'
    // Coaches
    | 'org.coaches.view'
    | 'org.coaches.invite'
    | 'org.coaches.suspend'
    // Clients
    | 'org.clients.view'
    | 'org.clients.assign'
    | 'org.clients.archive'
    // Payments
    | 'org.payments.view'
    | 'org.payments.edit'
    | 'org.payments.export'
    // Reports
    | 'org.reports.view'
    | 'org.reports.export'
    // Brand
    | 'org.brand.view'
    | 'org.brand.edit'
    | 'org.brand.publish'
    // Team & Access
    | 'org.team.view'
    | 'org.team.invite'
    | 'org.team.modify'
    // Audit
    | 'org.audit.view'
    | 'org.audit.export'
    // Settings
    | 'org.settings.view'
    | 'org.settings.edit'

const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
    org_owner: [
        'org.dashboard.view',
        'org.coaches.view', 'org.coaches.invite', 'org.coaches.suspend',
        'org.clients.view', 'org.clients.assign', 'org.clients.archive',
        'org.payments.view', 'org.payments.edit', 'org.payments.export',
        'org.reports.view', 'org.reports.export',
        'org.brand.view', 'org.brand.edit', 'org.brand.publish',
        'org.team.view', 'org.team.invite', 'org.team.modify',
        'org.audit.view', 'org.audit.export',
        'org.settings.view', 'org.settings.edit',
    ],
    org_admin: [
        'org.dashboard.view',
        'org.coaches.view', 'org.coaches.invite', 'org.coaches.suspend',
        'org.clients.view', 'org.clients.assign', 'org.clients.archive',
        'org.payments.view', 'org.payments.edit', 'org.payments.export',
        'org.reports.view', 'org.reports.export',
        'org.brand.view', 'org.brand.edit',
        'org.team.view', 'org.team.invite',
        'org.audit.view',
        'org.settings.view',
    ],
    ops: [
        'org.dashboard.view',
        'org.coaches.view', 'org.coaches.invite', 'org.coaches.suspend',
        'org.clients.view', 'org.clients.assign', 'org.clients.archive',
        'org.payments.view',
        'org.reports.view', 'org.reports.export',
        'org.team.view',
        'org.audit.view',
        'org.settings.view',
    ],
    analyst: [
        'org.dashboard.view',
        'org.clients.view',
        'org.payments.view',
        'org.reports.view', 'org.reports.export',
        'org.audit.view',      // read audit evidence
        'org.coaches.view',    // see coach performance (read-only)
    ],
    brand_manager: [
        'org.dashboard.view',
        'org.brand.view', 'org.brand.edit', 'org.brand.publish',
        'org.settings.view',
    ],
    coach: [],
}

export const ENTERPRISE_STAFF_ROLES = ['org_owner', 'org_admin', 'ops', 'analyst', 'brand_manager'] as const
export const ENTERPRISE_ADMIN_ROLES = ['org_owner', 'org_admin'] as const

export function orgRoleCan(role: string | null | undefined, permission: OrgPermission): boolean {
    if (!isOrgRole(role)) return false
    return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission)
}

/** Returns true if this role has ANY of the given permissions. */
export function orgRoleCanAny(role: string | null | undefined, ...permissions: OrgPermission[]): boolean {
    return permissions.some(p => orgRoleCan(role, p))
}

/**
 * Returns the org roles that hold a given permission. Use to gate server actions
 * by permission instead of a hardcoded role list (single source of truth).
 * e.g. rolesWithOrgPermission('org.brand.publish') → ['org_owner', 'brand_manager'].
 */
export function rolesWithOrgPermission(permission: OrgPermission): OrgRole[] {
    return (Object.keys(ROLE_PERMISSIONS) as OrgRole[]).filter(role =>
        (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission)
    )
}

export function isOrgRole(role: string | null | undefined): role is OrgRole {
    return role === 'org_owner' ||
        role === 'org_admin' ||
        role === 'ops' ||
        role === 'analyst' ||
        role === 'brand_manager' ||
        role === 'coach'
}

export function isEnterpriseStaffRole(role: string | null | undefined): role is Exclude<OrgRole, 'coach'> {
    return role === 'org_owner' ||
        role === 'org_admin' ||
        role === 'ops' ||
        role === 'analyst' ||
        role === 'brand_manager'
}

/** Human-readable role label. */
export function orgRoleLabel(role: OrgRole): string {
    const labels: Record<OrgRole, string> = {
        org_owner: 'Owner',
        org_admin: 'Admin',
        ops: 'Operaciones',
        analyst: 'Analista',
        brand_manager: 'Marca',
        coach: 'Coach',
    }
    return labels[role] ?? role
}
