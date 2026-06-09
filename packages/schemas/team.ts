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
