export type OrgRole = 'org_owner' | 'org_admin' | 'coach' | string

export type PostLoginProfile = {
    isCoach: boolean
    activeOrgSlug?: string | null
    activeOrgRole?: OrgRole | null
    clientCoachSlug?: string | null
}
