import { z } from 'zod'

// SERVER-ONLY. Gestión de miembros del pool (modelo "team").

// Crear coach NUEVO + sumarlo al pool. can_manage solo lo aplica el owner (el trigger lo
// re-valida en DB). temp_password opcional (si vacío se autogenera).
export const CreateTeamCoachSchema = z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    display_role: z.string().trim().max(60).optional().or(z.literal('')),
    can_manage: z.coerce.boolean().optional().default(false),
    temp_password: z.string().min(8).max(72).optional().or(z.literal('')),
})
export type CreateTeamCoachInput = z.infer<typeof CreateTeamCoachSchema>

// Vincular un coach EXISTENTE (por email) al pool.
export const AddExistingCoachSchema = z.object({
    email: z.email().max(254),
    display_role: z.string().trim().max(60).optional().or(z.literal('')),
})
export type AddExistingCoachInput = z.infer<typeof AddExistingCoachSchema>

// Editar la etiqueta de especialidad (display only).
export const UpdateTeamMemberRoleSchema = z.object({
    display_role: z.string().trim().max(60),
})
export type UpdateTeamMemberRoleInput = z.infer<typeof UpdateTeamMemberRoleSchema>

// ---- ADMIN/CEO: provisión de teams (/admin/teams) ----
const TEAM_SLUG_RE = /^[a-z0-9-]+$/

// Crear team + owner. owner_mode='existing' (lookup por email) o 'new' (crea cuenta).
// Los toggles de módulos se parsean aparte en la action (claves dinámicas).
export const CreateTeamAdminSchema = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().regex(TEAM_SLUG_RE, 'Slug: solo minúsculas, números y guiones').min(2).max(46).optional().or(z.literal('')),
    seat_limit: z.coerce.number().int().min(1).max(500),
    owner_mode: z.enum(['existing', 'new']),
    owner_email: z.email().max(254),
    owner_full_name: z.string().trim().max(120).optional().or(z.literal('')),
    owner_temp_password: z.string().min(8).max(72).optional().or(z.literal('')),
})
export type CreateTeamAdminInput = z.infer<typeof CreateTeamAdminSchema>

export const UpdateTeamAdminSchema = z.object({
    name: z.string().trim().min(2).max(80),
    seat_limit: z.coerce.number().int().min(1).max(500),
})
export type UpdateTeamAdminInput = z.infer<typeof UpdateTeamAdminSchema>
