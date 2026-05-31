import { z } from 'zod'

export const UpdateOrgSchema = z.object({
    name: z.string().min(2).max(80),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
})
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>

export const InviteCoachSchema = z.object({
    email: z.email(),
    role: z.enum(['org_admin', 'coach']),
})
export type InviteCoachInput = z.infer<typeof InviteCoachSchema>

// All roles that can be created via the admin create-user flow.
// 'coach' is included for the coaches page; staff-only form restricts to non-coach roles in UI.
export const CreateEnterpriseCoachSchema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.email(),
    role: z.enum(['org_admin', 'ops', 'analyst', 'brand_manager', 'coach']),
    temp_password: z.string().min(8).max(72).optional().or(z.literal('')),
})
export type CreateEnterpriseCoachInput = z.infer<typeof CreateEnterpriseCoachSchema>

// Roles that can be changed for existing staff (not org_owner, not coach)
export const CHANGEABLE_STAFF_ROLES = ['org_admin', 'ops', 'analyst', 'brand_manager'] as const
export type ChangeableStaffRole = typeof CHANGEABLE_STAFF_ROLES[number]
