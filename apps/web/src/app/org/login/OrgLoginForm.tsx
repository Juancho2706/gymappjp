'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, LogIn } from 'lucide-react'
import { OrgLoginSchema, type OrgLoginInput } from '@eva/schemas'
import { loginOrgAction, type OrgLoginState } from './_actions/login.actions'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'
import { CaptchaSlot } from '@/components/auth/CaptchaSlot'

interface OrgLoginFormProps {
    showCaptcha: boolean
    turnstileSiteKey: string | null
}

const initialState: OrgLoginState = {}

export function OrgLoginForm({ showCaptcha, turnstileSiteKey }: OrgLoginFormProps) {
    const [state, formAction] = useActionState(loginOrgAction, initialState)

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<OrgLoginInput>({
        resolver: zodResolver(OrgLoginSchema),
        mode: 'onBlur',
    })

    function onSubmit(data: OrgLoginInput) {
        const fd = new FormData()
        fd.set('email', data.email)
        fd.set('password', data.password)
        if (data.captchaToken) fd.set('cf-turnstile-response', data.captchaToken)
        React.startTransition(() => formAction(fd))
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="mb-6">
                <h1 className="text-xl font-black tracking-tight text-zinc-100">Panel Enterprise</h1>
                <p className="mt-1 text-sm text-zinc-500">Acceso exclusivo a administradores de organización.</p>
            </div>

            <AuthFormField
                id="org-email"
                label="Email corporativo"
                type="email"
                placeholder="admin@gimnasio.cl"
                autoComplete="email"
                error={errors.email?.message}
                variant="enterprise"
                leadingIcon={<Mail className="h-4 w-4" />}
                {...register('email')}
            />

            <PasswordInput
                id="org-password"
                label="Contraseña"
                labelEnd={
                    <a
                        href="/forgot-password"
                        className="text-xs text-zinc-400 hover:text-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 rounded"
                    >
                        ¿Olvidaste tu contraseña?
                    </a>
                }
                placeholder="••••••••"
                error={errors.password?.message}
                variant="enterprise"
                {...register('password')}
            />

            {showCaptcha && (
                <CaptchaSlot siteKey={turnstileSiteKey} theme="dark" />
            )}

            {state.error && (
                <AuthErrorAlert message={state.error} variant="enterprise" />
            )}

            <AuthSubmitButton
                label="Ingresar al panel Enterprise"
                pendingLabel="Iniciando sesión..."
                variant="enterprise"
                leadingIcon={<LogIn className="h-4 w-4" />}
            />
        </form>
    )
}
