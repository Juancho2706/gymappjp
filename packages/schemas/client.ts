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
