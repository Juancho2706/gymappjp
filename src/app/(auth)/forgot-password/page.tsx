'use client'

import { useActionState, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react'
import { forgotPasswordAction, type ForgotPasswordState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ForgotPasswordState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-bold rounded-xl transition-all duration-200',
                'bg-gradient-to-r from-emerald-500 to-teal-600 text-white',
                'hover:shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                </span>
            ) : (
                'Enviar link de recuperación'
            )}
        </button>
    )
}

function ForgotPasswordForm() {
    const [state, formAction] = useActionState(forgotPasswordAction, initialState)
    const searchParams = useSearchParams()
    const coachSlug = searchParams.get('coach_slug')

    return (
        <div className="animate-slide-up">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                    Recuperar contraseña
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Te enviaremos un link para resetear tu acceso
                </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
                {state?.success ? (
                    <div className="text-center py-4">
                        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-foreground mb-2">¡Email enviado!</h2>
                        <p className="text-muted-foreground text-sm">
                            Revisa tu bandeja de entrada. El link expira en 1 hora.
                        </p>
                    </div>
                ) : (
                    <form action={formAction} className="space-y-5">
                        {coachSlug && <input type="hidden" name="coach_slug" value={coachSlug} />}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-foreground text-sm font-semibold">
                                Email de tu cuenta
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="tu@email.com"
                                    autoComplete="email"
                                    required
                                    className={cn(
                                        'pl-10 h-12 bg-secondary border-border text-foreground rounded-xl',
                                        'placeholder:text-muted-foreground/50 focus:border-primary focus:ring-primary/30',
                                        'transition-colors duration-200'
                                    )}
                                />
                            </div>
                        </div>

                        {state?.error && (
                            <div className="animate-fade-in rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                                {state.error}
                            </div>
                        )}

                        <SubmitButton />
                    </form>
                )}
            </div>

            <div className="mt-6 text-center">
                <Link
                    href={coachSlug ? `/c/${coachSlug}/login` : "/login"}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Volver al inicio de sesión
                </Link>
            </div>
        </div>
    )
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <ForgotPasswordForm />
        </Suspense>
    )
}
