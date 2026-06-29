'use client'

import { useActionState, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Loader2, ShieldCheck } from 'lucide-react'
import { resetPasswordAction, type ResetPasswordState } from './_actions/reset-password.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'

const initialState: ResetPasswordState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)]',
                'shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                </span>
            ) : (
                'Establecer nueva contraseña'
            )}
        </button>
    )
}

function ResetPasswordForm() {
    const [state, formAction] = useActionState(resetPasswordAction, initialState)
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
            <div className="text-center mb-8 flex flex-col items-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-card bg-sport-100 text-sport-600 mb-4">
                    <ShieldCheck className="w-7 h-7" />
                </div>
                <h1
                    className="text-2xl font-black tracking-[-0.02em] text-text-strong font-display"
                >
                    Nueva contraseña
                </h1>
                <p className="mt-2 text-text-muted text-sm">
                    Elige una contraseña segura para tu cuenta
                </p>
            </div>

            <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-lg)]">
                <form action={formAction} className="space-y-5">
                    {coachSlug && <input type="hidden" name="coach_slug" value={coachSlug} />}
                    {teamSlug && <input type="hidden" name="team_slug" value={teamSlug} />}
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-text-strong text-[13px] font-semibold">
                            Nueva contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                required
                                minLength={8}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_password" className="text-text-strong text-[13px] font-semibold">
                            Confirmar contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                            <Input
                                id="confirm_password"
                                name="confirm_password"
                                type="password"
                                placeholder="Repite tu contraseña"
                                required
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
            </div>

            <div className="mt-6 text-center">
                <Link
                    href={loginHref}
                    className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                    Volver al inicio de sesión
                </Link>
            </div>
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <div className="w-full max-w-md mx-auto">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center gap-6 p-12 text-center">
                    <h1 className="text-2xl font-black tracking-[-0.02em] text-text-strong font-display">
                        Nueva contraseña
                    </h1>
                    <EvaRouteLoader subtitle="Cargando formulario…" size="md" />
                </div>
            }>
                <ResetPasswordForm />
            </Suspense>
        </div>
    )
}
