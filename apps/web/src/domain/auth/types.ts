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
    | 'student_standalone'
    | 'student_enterprise'

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
