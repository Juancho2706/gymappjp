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
    // isPending: el submit va por handleSubmit + startTransition(formAction), sin
    // `<form action>`, asi que useFormStatus dentro del boton nunca se entera del
    // envio; el pending real vive en esta transicion (React 19, 3er valor).
    const [state, formAction, isPending] = useActionState(loginAction, initialState)

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
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-[14px]">
                <AuthFormField
                    id="email"
                    label="Email"
                    type="email"
                    placeholder="coach@eva.app"
                    autoComplete="email"
                    error={errors.email?.message}
                    variant="coach"
                    leadingIcon={<Mail className="h-4 w-4" />}
                    {...register('email')}
                />

                <PasswordInput
                    id="password"
                    label="Contraseña"
                    placeholder="Tu contraseña"
                    error={errors.password?.message}
                    variant="coach"
                    {...register('password')}
                />

                <div className="text-right">
                    <Link
                        href="/forgot-password"
                        className="rounded text-[13px] font-bold text-sport-600 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                        ¿Olvidaste tu contraseña?
                    </Link>
                </div>
            </div>

            {showCaptcha && (
                <div className="mt-4">
                    <CaptchaSlot siteKey={turnstileSiteKey} theme="light" />
                </div>
            )}

            {displayError && (
                <div className="mt-4">
                    <AuthErrorAlert message={displayError} variant="coach" />
                </div>
            )}

            <div className="mt-[22px]">
                <AuthSubmitButton
                    label="Entrar como coach"
                    pendingLabel="Iniciando sesión..."
                    pending={isPending}
                    variant="coach"
                    size="lg"
                    trailingIcon={<ArrowRight className="h-4 w-4" />}
                />
            </div>

            <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-border-subtle" />
                <span className="text-xs font-semibold text-text-subtle">o</span>
                <div className="flex-1 h-px bg-border-subtle" />
            </div>

            <GoogleSignInButton intent="login" />

            <div className="pt-6 text-center text-sm text-text-muted">
                ¿No tienes cuenta?{' '}
                <Link
                    href="/register"
                    className="font-bold text-sport-600 hover:opacity-80 transition-opacity"
                >
                    Regístrate
                </Link>
            </div>
        </form>
    )
}
