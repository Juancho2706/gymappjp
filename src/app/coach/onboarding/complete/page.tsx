'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Store, Loader2, CheckCircle2 } from 'lucide-react'
import { completeOAuthOnboarding, type CompleteOnboardingState } from './_actions/complete.actions'
import { cn } from '@/lib/utils'

const initialState: CompleteOnboardingState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-semibold rounded-xl transition-all duration-200',
                'bg-primary hover:opacity-90 text-primary-foreground',
                'shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando tu cuenta...
                </span>
            ) : (
                'Empezar gratis →'
            )}
        </button>
    )
}

export default function CompleteOnboardingPage() {
    const [state, formAction] = useActionState(completeOAuthOnboarding, initialState)

    return (
        <div className="w-full max-w-md mx-auto animate-slide-up">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                    Un último paso
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Dale un nombre a tu marca para empezar
                </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm space-y-6">
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">Plan Free incluye:</p>
                    {[
                        '3 alumnos activos',
                        'Entrenos ilimitados',
                        'App personalizada para tus alumnos',
                        'Check-ins y seguimiento',
                    ].map((item) => (
                        <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                            {item}
                        </div>
                    ))}
                </div>

                <form action={formAction} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="brand_name" className="text-foreground text-sm font-medium">
                            Nombre de tu marca
                        </label>
                        <div className="relative">
                            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="brand_name"
                                name="brand_name"
                                type="text"
                                placeholder="Ej: JotaP Fitness"
                                required
                                minLength={2}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground pl-1">
                            Se generará tu URL: omnicoach.app/<strong>tu-marca</strong>
                        </p>
                    </div>

                    {state?.error && (
                        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {state.error}
                        </div>
                    )}

                    <SubmitButton />
                </form>
            </div>
        </div>
    )
}
