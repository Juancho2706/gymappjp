export type OrgRole = 'org_owner' | 'org_admin' | 'coach' | string

export type PostLoginProfile = {
    isCoach: boolean
    activeOrgSlug?: string | null
    activeOrgRole?: OrgRole | null
    clientCoachSlug?: string | null
}

export function getPostLoginRedirect(profile: PostLoginProfile): string {
    const isOrgAdmin = profile.activeOrgRole === 'org_owner' || profile.activeOrgRole === 'org_admin'

    if (profile.activeOrgSlug && isOrgAdmin) {
        return `/org/${profile.activeOrgSlug}`
    }

    if (profile.isCoach) {
        return '/coach/dashboard'
    }

    if (profile.clientCoachSlug) {
        return `/c/${profile.clientCoachSlug}/dashboard`
    }

    return '/login'
}
