'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Lock, Loader2, ShieldCheck } from 'lucide-react'
import { changePasswordAction, type ChangePasswordState } from '../login/_actions/login.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { use } from 'react'

const initialState: ChangePasswordState = {}

interface Props {
    params: Promise<{ coach_slug: string }>
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full h-12 rounded-control text-base font-bold tracking-[-0.01em] disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--theme-primary, #007AFF)', color: 'var(--primary-foreground, #ffffff)' }}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                </span>
            ) : (
                'Guardar nueva contraseña'
            )}
        </button>
    )
}

export default function ChangePasswordPage({ params }: Props) {
    const { coach_slug } = use(params)
    const [state, formAction] = useActionState(changePasswordAction, initialState)

    return (
        <div
            className="min-h-dvh flex items-center justify-center p-4 pt-safe bg-background"
        >
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-card bg-theme-subtle border border-theme mb-4">
                        <ShieldCheck className="w-8 h-8 text-theme" />
                    </div>
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong">
                        Crea tu contraseña
                    </h1>
                    <p className="mt-2 text-text-muted text-sm max-w-xs mx-auto">
                        Es tu primer acceso. Por seguridad, debes crear una contraseña propia.
                    </p>
                </div>

                <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-lg)]">
                    <form action={formAction} className="space-y-5">
                        <input type="hidden" name="coach_slug" value={coach_slug} />

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
                                    className="pl-10 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]"
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
                                    className="pl-10 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]"
                                />
                            </div>
                        </div>

                        {state?.error && (
                            <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                                {state.error}
                            </div>
                        )}

                        <div className="pt-2">
                            <SubmitButton />
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
