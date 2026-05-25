export type OrgRole = 'org_owner' | 'org_admin' | 'ops' | 'analyst' | 'brand_manager' | 'coach'

export type OrgPermission = 'org.audit.export'

const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
    org_owner: ['org.audit.export'],
    org_admin: [],
    ops: [],
    analyst: [],
    brand_manager: [],
    coach: [],
}

export const ENTERPRISE_STAFF_ROLES = ['org_owner', 'org_admin', 'ops', 'analyst', 'brand_manager'] as const
export const ENTERPRISE_ADMIN_ROLES = ['org_owner', 'org_admin'] as const

export function orgRoleCan(role: string | null | undefined, permission: OrgPermission): boolean {
    if (!isOrgRole(role)) return false
    return ROLE_PERMISSIONS[role].includes(permission)
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
