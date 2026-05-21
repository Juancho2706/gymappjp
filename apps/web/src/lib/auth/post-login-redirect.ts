export type { OrgRole, PostLoginProfile } from '@/domain/auth/types'
import type { PostLoginProfile } from '@/domain/auth/types'

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
