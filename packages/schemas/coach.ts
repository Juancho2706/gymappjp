import { z } from 'zod'
import { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE } from './brand'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

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
    // ── white-label v2 (decisión CEO 2026-06-21) — gateados a Pro+ en el server action ──
    // color2 INDEPENDIENTE (badges/tags/macros/charts); accent por-modo; tinte neutro; fuente curada; loader.
    brand_secondary_color: z.string().regex(HEX_RE, 'Color hexadecimal inválido').optional().or(z.literal('')),
    accent_light: z.string().regex(HEX_RE, 'Color hexadecimal inválido').optional().or(z.literal('')),
    accent_dark: z.string().regex(HEX_RE, 'Color hexadecimal inválido').optional().or(z.literal('')),
    neutral_tint: z.boolean().default(false),
    // brand_font_key: z.enum cerrado (NUNCA string libre — única defensa anti CSS-injection en fuente).
    brand_font_key: z.enum(FONT_KEY_TUPLE).optional().or(z.literal('')),
    loader_variant: z.enum(LOADER_VARIANT_TUPLE).default('eva'),
    welcome_modal_enabled: z.boolean().default(false),
    welcome_modal_content: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
    welcome_modal_type: z.enum(['text', 'video']).default('text'),
    // Ejecutor V3 (E0.7) — tema del ejecutor del alumno: 'coach' usa los colores del coach,
    // 'eva' usa la paleta EVA (Sport/Aqua/Ember). Preferencia (no branding visual gateado).
    executor_theme: z.enum(['coach', 'eva']).default('coach'),
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

// Intake OAuth post-signup del coach (mobile `app/coach/onboarding.tsx` + web `coach/onboarding/complete`).
// A diferencia de RegisterCoachFree (crea auth + coach con email/password), acá el usuario YA existe
// (autenticado por Google) y solo falta materializar su fila `coaches`: nombre + marca. Los consentimientos
// (legal/salud, obligatorios; marketing opcional) se gatean en la UI y se validan literal-true en el server.
// Free-tier: los planes pagos se activan en eva-app.cl (money-safety, mismo criterio que RegisterCoachFree).
export const CompleteCoachOnboardingSchema = z.object({
    full_name: z.string().min(2, 'Nombre requerido').max(100),
    brand_name: z.string().min(2, 'Nombre de marca requerido').max(100),
})
export type CompleteCoachOnboardingInput = z.infer<typeof CompleteCoachOnboardingSchema>

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
