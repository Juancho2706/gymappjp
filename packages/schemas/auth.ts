import { z } from 'zod'

export const LoginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const ForgotPasswordSchema = z.object({
    email: z.string().email('Email inválido'),
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
    email: z.string().email('Email inválido'),
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
