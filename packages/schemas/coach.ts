import { z } from 'zod'

export const BrandSettingsSchema = z.object({
    full_name: z.string().min(2, 'Nombre requerido').max(100),
    brand_name: z.string().min(2, 'Nombre de marca requerido').max(100),
    // slug e invite_code son INMUTABLES (set-once en el registro) — no se editan en settings.
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido'),
    use_brand_colors_coach: z.boolean().default(false),
    welcome_message: z.string().max(240, 'El mensaje debe tener maximo 240 caracteres').optional(),
    loader_text: z.string().max(10, 'Máximo 10 caracteres').optional().or(z.literal('')),
    use_custom_loader: z.boolean().default(false),
    loader_text_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido').optional().or(z.literal('')),
    loader_icon_mode: z.enum(['eva', 'coach', 'none']).default('eva'),
    welcome_modal_enabled: z.boolean().default(false),
    welcome_modal_content: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
    welcome_modal_type: z.enum(['text', 'video']).default('text'),
}).superRefine((data, ctx) => {
    if (data.welcome_modal_enabled && data.welcome_modal_type === 'video' && data.welcome_modal_content) {
        const videoUrlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/.+$/i
        if (!videoUrlPattern.test(data.welcome_modal_content)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Debe ser una URL válida de YouTube o Vimeo',
                path: ['welcome_modal_content'],
            })
        }
    }
})
export type BrandSettingsInput = z.infer<typeof BrandSettingsSchema>

export const SupportMessageSchema = z.object({
    type: z.enum(['help', 'bug', 'idea']),
    subject: z.string().min(3, 'El asunto es requerido').max(200),
    description: z.string().min(10, 'Describe tu consulta con al menos 10 caracteres').max(5000),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    attachmentUrl: z.string().optional(),
    metadataUrl: z.string().max(1000).optional(),
    metadataUserAgent: z.string().max(1000).optional(),
})
export type SupportMessageInput = z.infer<typeof SupportMessageSchema>

export const CloneExerciseSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    muscle_group: z.string().min(1),
    equipment: z.string().nullable(),
    video_url: z.string().url().nullable().or(z.literal('')),
    difficulty: z.string().nullable().optional(),
    gender_focus: z.string().nullable().optional(),
    instructions: z.array(z.string()).nullable().optional(),
    secondary_muscles: z.array(z.string()).nullable().optional(),
})
export type CloneExerciseInput = z.infer<typeof CloneExerciseSchema>

export const RegisterCoachFreeSchema = z.object({
    full_name: z.string().min(2, 'Nombre requerido').max(100),
    brand_name: z.string().min(2, 'Nombre de marca requerido').max(100),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})
export type RegisterCoachFreeInput = z.infer<typeof RegisterCoachFreeSchema>

export const AdminCreateCoachSchema = z.object({
    full_name: z.string().min(2).max(100),
    email: z.string().email(),
    temp_password: z.string().min(8),
    brand_name: z.string().min(2).max(80),
    // Solo sale tiers en la CREACION (D5 del plan 04): growth/scale son legacy fuera de venta — no se crean cuentas nuevas en esos tiers.
    // El UPDATE (UpdateCoachSchema en coach-actions.ts) SI conserva el union completo para gestionar grandfathered.
    subscription_tier: z.enum(['free', 'starter', 'pro', 'elite']),
    billing_cycle: z.enum(['monthly', 'quarterly', 'annual']),
    trial_days: z.coerce.number().int().min(0).max(3650),
})
export type AdminCreateCoachInput = z.infer<typeof AdminCreateCoachSchema>
