'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CoachLoginSchema, type CoachLoginInput } from '@eva/schemas'
import { loginAction, type LoginState } from '../_actions/login.actions'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'
import { CaptchaSlot } from '@/components/auth/CaptchaSlot'
import { startCoachGoogleLogin } from '@/lib/auth/client-oauth'

interface CoachLoginFormProps {
    urlError?: string | null
    showCaptcha: boolean
    turnstileSiteKey: string | null
}

const initialState: LoginState = {}

export function CoachLoginForm({ urlError, showCaptcha, turnstileSiteKey }: CoachLoginFormProps) {
    const [state, formAction] = useActionState(loginAction, initialState)

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CoachLoginInput>({
        resolver: zodResolver(CoachLoginSchema),
        mode: 'onBlur',
    })

    function onSubmit(data: CoachLoginInput) {
        const fd = new FormData()
        fd.set('email', data.email)
        fd.set('password', data.password)
        if (data.captchaToken) fd.set('cf-turnstile-response', data.captchaToken)
        React.startTransition(() => formAction(fd))
    }

    const displayError = state?.error || urlError

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <AuthFormField
                id="email"
                label="Email"
                type="email"
                placeholder="coach@ejemplo.com"
                autoComplete="email"
                error={errors.email?.message}
                variant="coach"
                leadingIcon={<Mail className="h-4 w-4" />}
                {...register('email')}
            />

            <PasswordInput
                id="password"
                label="Contraseña"
                labelEnd={
                    <Link
                        href="/forgot-password"
                        className="text-xs text-primary hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                    >
                        ¿Olvidaste tu contraseña?
                    </Link>
                }
                placeholder="••••••••"
                error={errors.password?.message}
                variant="coach"
                {...register('password')}
            />

            {showCaptcha && (
                <CaptchaSlot siteKey={turnstileSiteKey} theme="light" />
            )}

            {displayError && (
                <AuthErrorAlert message={displayError} variant="coach" />
            )}

            <div className="pt-1">
                <AuthSubmitButton
                    label="Ingresar al Panel"
                    pendingLabel="Iniciando sesión..."
                    variant="coach"
                    leadingIcon={<ArrowRight className="h-4 w-4" />}
                />
            </div>

            <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o ingresá con</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <button
                type="button"
                onClick={startCoachGoogleLogin}
                className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
                <svg
                    className="w-4 h-4 shrink-0"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                >
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuar con Google
            </button>

            <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">¿Nuevo en EVA?</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <div className="text-center">
                <Link
                    href="/register"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity font-medium"
                >
                    Crear cuenta
                    <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        </form>
    )
}
