'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2, ArrowRight } from 'lucide-react'
import { clientLoginAction, type ClientLoginState } from './_actions/login.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordVisibilityToggle } from '@/components/auth/PasswordVisibilityToggle'
import { getStudentLoginQueryNotice } from '@/lib/auth/student-login-messages'
import { cn } from '@/lib/utils'

const initialState: ClientLoginState = {}

interface Props {
    coachSlug: string
    primaryColor: string
    brandName: string
    logoUrl: string | null
    /**
     * Prefijo para los `id`/`htmlFor` de los campos. El login renderiza DOS árboles
     * (móvil <760 + desktop ≥760) simultáneos en el DOM (uno oculto por CSS), así que
     * los ids deben ser únicos por instancia — si no, el `htmlFor` de un label enfoca
     * el input del árbol oculto. Default '' preserva los ids móviles históricos.
     */
    idPrefix?: string
    /**
     * `?error=` de la URL («Vive tu app» directo §4). Hoy solo `vive_tu_app_expirado`, que emite
     * `/vive-tu-app` cuando el magic link del demo venció o ya se usó: sin esto el coach caía en un
     * login pelado, sin explicación ni camino de vuelta. Un código desconocido no pinta nada.
     */
    errorCode?: string | null
    /**
     * Código de invitación del coach (FCN W2.8). Con él, el desconocido que cae en este login
     * —hoy un callejón: no hay registro de alumno acá— tiene salida a `/join/{código}`, la puerta
     * de solicitudes. Sin código (o vacío) no se pinta nada: un link a `/join/` sin código es un 404.
     */
    inviteCode?: string | null
}

function SubmitButton({ primaryColor, brandName }: { primaryColor: string; brandName: string }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-control text-base font-bold tracking-[-0.01em] transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: primaryColor, color: 'var(--primary-foreground, #ffffff)' }}
        >
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ingresando...
                </>
            ) : (
                <>
                    Entrar a {brandName}
                    <ArrowRight className="h-4 w-4" />
                </>
            )}
        </button>
    )
}

export default function ClientLoginForm({ coachSlug, primaryColor, brandName, logoUrl, idPrefix = '', errorCode = null, inviteCode = null }: Props) {
    const [state, formAction] = useActionState(clientLoginAction, initialState)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const emailId = `${idPrefix}client-email`
    const passwordId = `${idPrefix}client-password`
    const joinHref = inviteCode?.trim() ? `/join/${inviteCode.trim()}` : null

    // Lo que devuelve el intento manda sobre lo que traía la URL: si el coach ya tecleó y falló,
    // el mensaje del link vencido dejó de ser lo relevante.
    const notice = state?.error
        ? { error: state.error, action: state.action }
        : getStudentLoginQueryNotice(errorCode)

    useEffect(() => {
        if (state.success && state.redirectUrl) {
            // Store sticky branding for the "Intelligent Redirect"
            localStorage.setItem('last_coach_slug', coachSlug)
            localStorage.setItem('coach_brand_name', brandName)
            if (logoUrl) {
                localStorage.setItem('coach_logo_url', logoUrl)
            } else {
                localStorage.removeItem('coach_logo_url')
            }
            
            // Redirect to the appropriate page
            router.push(state.redirectUrl)
        }
    }, [state, coachSlug, brandName, logoUrl, router])

    return (
        <form action={formAction} className="space-y-[13px]">
                <input type="hidden" name="coach_slug" value={coachSlug} />

                <div className="space-y-2">
                    <Label htmlFor={emailId} className="text-text-strong text-[13px] font-semibold">
                        Email
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                        <Input
                            id={emailId}
                            name="email"
                            type="email"
                            placeholder="tu@email.com"
                            autoComplete="email"
                            required
                            className={cn(
                                'pl-10 border-border-default',
                                'focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]'
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={passwordId} className="text-text-strong text-[13px] font-semibold">
                            Contraseña
                        </Label>
                        <Link
                            href={`/forgot-password?coach_slug=${coachSlug}`}
                            className="text-xs font-semibold hover:underline"
                            style={{ color: primaryColor }}
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                        <Input
                            id={passwordId}
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            className={cn(
                                'pl-10 pr-12 border-border-default',
                                'focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]'
                            )}
                        />
                        <PasswordVisibilityToggle
                            visible={showPassword}
                            onToggle={() => setShowPassword((v) => !v)}
                        />
                    </div>
                </div>

                {notice && (
                    /* Con salida (coach en el login de sus alumnos, link vencido) el bloque deja de
                       ser rojo: es una explicación con camino, no un error del alumno — SPEC §4. */
                    <div
                        role={notice.action ? 'status' : 'alert'}
                        className={cn(
                            'animate-fade-in rounded-control px-4 py-3 text-sm',
                            notice.action
                                ? 'border border-subtle bg-surface-sunken font-medium leading-relaxed text-text-strong'
                                : 'border border-transparent bg-[var(--danger-100)] font-semibold text-[var(--danger-600)]'
                        )}
                    >
                        <p>{notice.error}</p>
                        {notice.action && (
                            <Link
                                href={notice.action.href}
                                className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold hover:underline"
                                style={{ color: primaryColor }}
                            >
                                {notice.action.label}
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                )}

                <div className="pt-2">
                    <SubmitButton primaryColor={primaryColor} brandName={brandName} />
                </div>

                {/* FCN W2.8 — escape del desconocido. Mismo tamaño/peso/color de link que
                    «¿Olvidaste tu contraseña?», bajo el botón: es la salida, no un campo del
                    formulario, y ahí es donde la busca quien no tiene cuenta. */}
                {joinHref && (
                    <div className="pt-1 text-center">
                        <Link
                            href={joinHref}
                            className="text-xs font-semibold hover:underline"
                            style={{ color: primaryColor }}
                        >
                            ¿No tienes cuenta? Pídele acceso a {brandName}
                        </Link>
                    </div>
                )}
        </form>
    )
}
