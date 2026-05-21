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

export const CreateEnterpriseCoachSchema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.email(),
    role: z.enum(['org_admin', 'coach']),
    temp_password: z.string().min(8).max(72).optional().or(z.literal('')),
})
export type CreateEnterpriseCoachInput = z.infer<typeof CreateEnterpriseCoachSchema>
