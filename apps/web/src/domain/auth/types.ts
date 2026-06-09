export type OrgRole = 'org_owner' | 'org_admin' | 'coach' | string

export type PostLoginProfile = {
    isCoach: boolean
    isOrgUser?: boolean
    activeOrgSlug?: string | null
    activeOrgRole?: OrgRole | null
    clientCoachSlug?: string | null
}

export type WorkspaceType =
    | 'coach_standalone'
    | 'enterprise_coach'
    | 'enterprise_staff'
    | 'coach_team'
    | 'student_standalone'
    | 'student_enterprise'
    | 'student_team'

export type EnterpriseStaffRole = 'org_owner' | 'org_admin' | 'ops' | 'analyst' | 'brand_manager'

export type ActiveWorkspace =
    | {
        type: 'coach_standalone'
        userId: string
        coachId: string
    }
    | {
        type: 'enterprise_coach'
        userId: string
        orgId: string
        coachId: string
        memberId: string
    }
    | {
        type: 'enterprise_staff'
        userId: string
        orgId: string
        memberId: string
        role: EnterpriseStaffRole
    }
    | {
        type: 'coach_team'
        userId: string
        coachId: string
        teamId: string
    }
    | {
        type: 'student_standalone'
        userId: string
        clientId: string
        coachId: string
    }
    | {
        type: 'student_enterprise'
        userId: string
        clientId: string
        orgId: string
        coachId: string | null
    }
    | {
        type: 'student_team'
        userId: string
        clientId: string
        teamId: string
    }

export type WorkspaceSummary = ActiveWorkspace & {
    label: string
    brandName?: string | null
    slug?: string | null
    isLastUsed?: boolean
}

export type WorkspaceBrand = {
    workspaceType: WorkspaceType
    brandName: string
    primaryColor: string
    logoUrl: string | null
    loaderText?: string | null
    /** White-label loader/splash tokens — also consumed by the future RN app. */
    useCustomLoader?: boolean
    loaderIconMode?: 'logo' | 'text' | 'coach' | 'eva' | 'none'
    loaderTextColor?: string | null
    splashBgColor?: string | null
    /**
     * Brand-theme INPUTS (not resolved colors). Consumers (web + RN) feed these to
     * `@eva/brand-kit` resolveBrandTheme() to get identical light+dark themes.
     */
    accentLight?: string | null
    accentDark?: string | null
    logoUrlDark?: string | null
    neutralTint?: boolean
    source: 'organization' | 'coach' | 'eva_default'
}

export type WorkspacePermission =
    | 'org.dashboard.view'
    | 'org.team.manage'
    | 'org.brand.manage'
    | 'org.audit.view'
    | 'org.billing.view'
    | 'coach.dashboard.view'
    | 'coach.clients.manage'
    | 'coach.brand.manage'
    | 'coach.billing.view'
    | 'student.dashboard.view'
