import { z } from 'zod'

const baseLogin = z.object({
    email: z.string().trim().toLowerCase().email('Email inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    captchaToken: z.string().optional(),
})

export const CoachLoginSchema = baseLogin
export type CoachLoginInput = z.infer<typeof CoachLoginSchema>

export const OrgLoginSchema = baseLogin
export type OrgLoginInput = z.infer<typeof OrgLoginSchema>

export const PASSWORD_MIN_CLIENT = 8

/** @deprecated Use CoachLoginSchema. Kept for backwards compatibility. */
export const LoginSchema = CoachLoginSchema
/** @deprecated Use CoachLoginInput. */
export type LoginInput = CoachLoginInput

export const ForgotPasswordSchema = z.object({
    email: z.string().trim().toLowerCase().email('Email inválido'),
})
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>

export const ResetPasswordSchema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
})
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>

export const ClientLoginSchema = z.object({
    email: z.string().trim().toLowerCase().email('Email inválido'),
    password: z.string().min(1, 'La contraseña es requerida'),
    coach_slug: z.string(),
})
export type ClientLoginInput = z.infer<typeof ClientLoginSchema>

export const ChangePasswordSchema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm_password: z.string(),
    coach_slug: z.string(),
}).refine((d) => d.password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
