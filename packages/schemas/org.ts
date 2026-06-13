import { z } from 'zod'

export const UpdateOrgSchema = z.object({
    name: z.string().min(2).max(80),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
    default_coach_capacity: z.coerce.number().int().min(1).max(500).optional(),
})
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>

// Hex estricto reutilizable para campos de color de marca (org draft).
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido')

// Stored-XSS hardening: el loader_text/loader_text_color de la org se inyectan en un <style>
// del shell del alumno (apps/web/.../c/[coach_slug]/layout.tsx). Sin validación, un org_admin
// podía guardar `</style><script>…` y XSSear a todos los alumnos del tenant. Espejo del coach
// schema: loader_text acotado y sin < >; loader_text_color hex estricto.
export const OrgBrandDraftSchema = z.object({
    name: z.string().min(2).max(80).optional(),
    primary_color: HexColor.optional(),
    logo_url: z.string().url().nullish().or(z.literal('')),
    logo_url_dark: z.string().url().nullish().or(z.literal('')),
    loader_text: z.string().max(20).regex(/^[^<>]*$/, 'Caracteres no permitidos').optional().or(z.literal('')).nullable(),
    use_custom_loader: z.boolean().optional(),
    loader_icon_mode: z.string().max(20).optional(),
    loader_text_color: HexColor.optional().or(z.literal('')).nullable(),
    splash_bg_color: HexColor.optional().or(z.literal('')).nullable(),
    accent_light: HexColor.optional().or(z.literal('')).nullable(),
    accent_dark: HexColor.optional().or(z.literal('')).nullable(),
    neutral_tint: z.boolean().optional(),
})
export type OrgBrandDraftInput = z.infer<typeof OrgBrandDraftSchema>

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
