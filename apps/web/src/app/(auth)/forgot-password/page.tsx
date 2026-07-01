'use client'

import { useActionState, useState, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Loader2, ChevronLeft, ArrowRight, Send } from 'lucide-react'
import { forgotPasswordAction, type ForgotPasswordState } from './_actions/forgot-password.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'

const initialState: ForgotPasswordState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-14 flex items-center justify-center gap-2 text-[17px] font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)]',
                'hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                </>
            ) : (
                <>
                    Enviar enlace de recuperación
                    <ArrowRight className="w-4 h-4" />
                </>
            )}
        </button>
    )
}

function ForgotPasswordForm() {
    const [state, formAction] = useActionState(forgotPasswordAction, initialState)
    const [emailValue, setEmailValue] = useState('')
    const searchParams = useSearchParams()
    const coachSlug = searchParams.get('coach_slug')
    const teamSlug = searchParams.get('team_slug')
    // El alumno de team vuelve a su login de pool white-label; el standalone al /c del coach.
    const loginHref = teamSlug
        ? `/t/${teamSlug}/login`
        : coachSlug
            ? `/c/${coachSlug}/login`
            : '/login'

    return (
        <div className="animate-slide-up">
            <div className="-ml-2 flex items-center">
                <Link
                    href={loginHref}
                    aria-label="Volver al inicio de sesión"
                    className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken text-text-strong transition-colors hover:bg-[color-mix(in_oklab,var(--surface-sunken)_88%,#000)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </Link>
            </div>

            {state?.success ? (
                <div className="pt-10 text-center">
                    <div className="mb-[18px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
                        <Send className="h-[30px] w-[30px]" />
                    </div>
                    <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">
                        Revisá tu correo
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                        Si existe una cuenta asociada a{' '}
                        <strong className="text-text-strong">{emailValue || 'ese email'}</strong>, te enviamos
                        un enlace para restablecer tu contraseña. El enlace expira en 1 hora.
                    </p>
                    <Link
                        href={loginHref}
                        className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] text-[17px] font-bold tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all duration-200 hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] active:scale-[0.98]"
                    >
                        Volver al inicio de sesión
                    </Link>
                </div>
            ) : (
                <>
                    <div className="mt-3">
                        <h1 className="font-display text-[26px] font-black tracking-[-0.02em] text-text-strong">
                            ¿Olvidaste tu contraseña?
                        </h1>
                        <p className="mt-2 text-sm leading-relaxed text-text-muted">
                            Ingresá tu email y te enviamos un enlace para crear una nueva.
                        </p>
                    </div>

                    <form action={formAction} className="mt-[22px] space-y-5">
                        {coachSlug && <input type="hidden" name="coach_slug" value={coachSlug} />}
                        {teamSlug && <input type="hidden" name="team_slug" value={teamSlug} />}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-text-strong text-[13px] font-semibold">
                                Email de tu cuenta
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="tu@email.com"
                                    autoComplete="email"
                                    required
                                    onChange={(event) => setEmailValue(event.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {state?.error && (
                            <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                                {state.error}
                            </div>
                        )}

                        <SubmitButton />
                    </form>

                    <div className="mt-6 text-center text-[13.5px] text-text-muted">
                        ¿Te acordaste?{' '}
                        <Link
                            href={loginHref}
                            className="font-bold text-sport-600 hover:opacity-80 transition-opacity"
                        >
                            Iniciá sesión
                        </Link>
                    </div>
                </>
            )}
        </div>
    )
}

export default function ForgotPasswordPage() {
    return (
        <div className="w-full max-w-md mx-auto">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center gap-6 p-12 text-center">
                    <h1 className="text-2xl font-black tracking-[-0.02em] text-text-strong font-display">
                        Recuperar contraseña
                    </h1>
                    <EvaRouteLoader subtitle="Cargando formulario…" size="md" />
                </div>
            }>
                <ForgotPasswordForm />
            </Suspense>
        </div>
    )
}
