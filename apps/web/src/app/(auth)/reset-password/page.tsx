'use client'

import { useActionState, useState, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Loader2, Check } from 'lucide-react'
import { resetPasswordAction, type ResetPasswordState } from './_actions/reset-password.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordVisibilityToggle } from '@/components/auth/PasswordVisibilityToggle'
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
                'w-full h-14 flex items-center justify-center gap-2 text-[17px] font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)]',
                'shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                </>
            ) : (
                <>
                    Guardar contraseña
                    <Check className="w-4 h-4" />
                </>
            )}
        </button>
    )
}

function ResetPasswordForm() {
    const [state, formAction] = useActionState(resetPasswordAction, initialState)
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
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
            <div>
                <h1 className="font-display text-[26px] font-black tracking-[-0.02em] text-text-strong">
                    Crea una nueva contraseña
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    Elige una contraseña segura de al menos 8 caracteres.
                </p>
            </div>

            <form action={formAction} className="mt-[22px] space-y-5">
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
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Mínimo 8 caracteres"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="pl-10 pr-12"
                        />
                        <PasswordVisibilityToggle
                            visible={showPassword}
                            onToggle={() => setShowPassword((v) => !v)}
                        />
                    </div>
                    {password.length > 0 && (() => {
                        const checks = [password.length >= 8, /\d/.test(password), /[a-zA-Z]/.test(password)]
                        const score = checks.filter(Boolean).length
                        return (
                            <div className="mt-2">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className="h-1 flex-1 rounded-pill"
                                            style={{
                                                background:
                                                    i < score
                                                        ? score === 3
                                                            ? 'var(--success-500)'
                                                            : score === 2
                                                                ? 'var(--warning-500)'
                                                                : 'var(--danger-500)'
                                                        : 'var(--surface-sunken)',
                                            }}
                                        />
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] text-text-muted">
                                    {score === 3 ? 'Contraseña segura ✓' : '8+ caracteres con letras y números.'}
                                </p>
                            </div>
                        )
                    })()}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirm_password" className="text-text-strong text-[13px] font-semibold">
                        Repite la contraseña
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                        <Input
                            id="confirm_password"
                            name="confirm_password"
                            type={showConfirm ? 'text' : 'password'}
                            placeholder="Vuelve a escribirla"
                            required
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="pl-10 pr-12"
                        />
                        <PasswordVisibilityToggle
                            visible={showConfirm}
                            onToggle={() => setShowConfirm((v) => !v)}
                        />
                    </div>
                    {confirmPassword.length > 0 && password !== confirmPassword && (
                        <p className="text-xs text-text-subtle">No coinciden todavía.</p>
                    )}
                </div>

                {state?.error && (
                    <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                        {state.error}
                    </div>
                )}

                <SubmitButton />
            </form>

            <div className="mt-6 text-center">
                <Link
                    href={loginHref}
                    className="text-[13.5px] text-text-muted hover:text-text-strong transition-colors"
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
                        Crea una nueva contraseña
                    </h1>
                    <EvaRouteLoader subtitle="Cargando formulario…" size="md" />
                </div>
            }>
                <ResetPasswordForm />
            </Suspense>
        </div>
    )
}
