export type OrgRole = 'org_owner' | 'org_admin' | 'coach'

export type OrgPermission = 'org.audit.export'

const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
    org_owner: ['org.audit.export'],
    org_admin: [],
    coach: [],
}

export function orgRoleCan(role: string | null | undefined, permission: OrgPermission): boolean {
    if (role !== 'org_owner' && role !== 'org_admin' && role !== 'coach') return false
    return ROLE_PERMISSIONS[role].includes(permission)
}
