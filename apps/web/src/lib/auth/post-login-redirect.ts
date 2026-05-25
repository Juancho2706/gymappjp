export type { OrgRole, PostLoginProfile } from '@/domain/auth/types'
import type { PostLoginProfile } from '@/domain/auth/types'
import { isEnterpriseStaffRole } from '@/domain/org/permissions'

export function getPostLoginRedirect(profile: PostLoginProfile): string {
    const isOrgStaff = isEnterpriseStaffRole(profile.activeOrgRole)

    if (profile.isOrgUser && profile.activeOrgSlug && isOrgStaff) {
        return `/org/${profile.activeOrgSlug}`
    }

    if (profile.activeOrgSlug && isOrgStaff) {
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
