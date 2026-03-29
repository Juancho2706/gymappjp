'use client'

import { useActionState, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Loader2, ShieldCheck } from 'lucide-react'
import { resetPasswordAction, type ResetPasswordState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ResetPasswordState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-semibold rounded-xl transition-all duration-200',
                'bg-violet-600 hover:bg-violet-500 text-white',
                'shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:shadow-[0_0_32px_rgba(139,92,246,0.55)]',
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

    return (
        <div className="animate-slide-up">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 mb-4">
                    <ShieldCheck className="w-7 h-7 text-violet-400" />
                </div>
                <h1
                    className="text-2xl font-bold tracking-tight text-zinc-50"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                >
                    Nueva contraseña
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Elige una contraseña segura para tu cuenta
                </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
                <form action={formAction} className="space-y-5">
                    {coachSlug && <input type="hidden" name="coach_slug" value={coachSlug} />}
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-muted-foreground text-sm font-medium">
                            Nueva contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                required
                                minLength={8}
                                className="pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl placeholder:text-muted-foreground focus:border-violet-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_password" className="text-muted-foreground text-sm font-medium">
                            Confirmar contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input
                                id="confirm_password"
                                name="confirm_password"
                                type="password"
                                placeholder="Repite tu contraseña"
                                required
                                className="pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl placeholder:text-muted-foreground focus:border-violet-500"
                            />
                        </div>
                    </div>

                    {state?.error && (
                        <div className="animate-fade-in rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                            {state.error}
                        </div>
                    )}

                    <SubmitButton />
                </form>
            </div>

            <div className="mt-6 text-center">
                <Link
                    href={coachSlug ? `/c/${coachSlug}/login` : "/login"}
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
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    )
}
