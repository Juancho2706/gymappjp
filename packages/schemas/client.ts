import { z } from 'zod'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

const fileField = z
    .any()
    .refine(
        (file) => !file || file.size === 0 || file.size <= MAX_FILE_SIZE,
        'El tamaño máximo de imagen es 5MB.'
    )
    .refine(
        (file) => !file || file.size === 0 || ACCEPTED_IMAGE_TYPES.includes(file.type),
        'Solo se aceptan formatos .jpg, .jpeg, .png y .webp.'
    )
    .optional()

export const CreateClientSchema = z.object({
    full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
    subscription_start_date: z.string().optional(),
    temp_password: z.string().min(8, 'La contraseña temporal debe tener al menos 8 caracteres'),
    age_confirmed: z.literal('on', { message: 'Debes confirmar que el alumno tiene 14 años o más, o que cuentas con el consentimiento de su tutor legal.' }),
})
export type CreateClientInput = z.infer<typeof CreateClientSchema>

export const UpdateClientDataSchema = z.object({
    client_id: z.string().uuid(),
    full_name: z.string().min(2, 'Nombre muy corto').max(100),
    phone: z.string().optional(),
    weight_kg: z.coerce.number().positive().optional().or(z.literal('')),
    height_cm: z.coerce.number().positive().optional().or(z.literal('')),
    goals: z.string().optional(),
    experience_level: z.string().optional(),
    availability: z.string().optional(),
    injuries: z.string().optional(),
    medical_conditions: z.string().optional(),
})
export type UpdateClientDataInput = z.infer<typeof UpdateClientDataSchema>

export const CheckInSchema = z.object({
    weight: z.coerce.number().min(20).max(400),
    energy_level: z.coerce.number().min(1).max(10),
    notes: z.string().max(1000).optional(),
    photo: fileField,
    back_photo: fileField,
})
export type CheckInInput = z.infer<typeof CheckInSchema>

export const QuickWeightSchema = z.object({
    weight: z.coerce.number().min(20).max(400),
    coach_slug: z.string().min(1),
})
export type QuickWeightInput = z.infer<typeof QuickWeightSchema>

export const UpsertHabitsSchema = z.object({
    clientId: z.string().uuid(),
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    coachSlug: z.string().min(1),
    waterMl: z.number().int().min(0).max(10000).nullable(),
    steps: z.number().int().min(0).max(100000).nullable(),
    sleepHours: z.number().min(0).max(24).nullable(),
    fastingHours: z.number().int().min(0).max(72).nullable(),
    supplements: z.array(z.string().max(50)).max(20).nullable(),
    notes: z.string().max(500).nullable(),
})
export type UpsertHabitsInput = z.infer<typeof UpsertHabitsSchema>
