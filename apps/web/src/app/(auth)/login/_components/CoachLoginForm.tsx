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
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'

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

            <GoogleSignInButton intent="login" />

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
