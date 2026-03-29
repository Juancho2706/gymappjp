'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { clientLoginAction, type ClientLoginState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ClientLoginState = {}

interface Props {
    coachSlug: string
    primaryColor: string
}

function SubmitButton({ primaryColor }: { primaryColor: string }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="btn-theme w-full h-12 rounded-xl text-base font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor }}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ingresando...
                </span>
            ) : (
                'Ingresar'
            )}
        </button>
    )
}

export default function ClientLoginForm({ coachSlug, primaryColor }: Props) {
    const [state, formAction] = useActionState(clientLoginAction, initialState)

    return (
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Accede a tu entrenamiento</h2>
                <p className="text-muted-foreground text-sm mt-1">
                    Tu coach te envió las credenciales por email
                </p>
            </div>

            <form action={formAction} className="space-y-5">
                <input type="hidden" name="coach_slug" value={coachSlug} />

                <div className="space-y-2">
                    <Label htmlFor="client-email" className="text-muted-foreground text-sm font-medium">
                        Email
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            id="client-email"
                            name="email"
                            type="email"
                            placeholder="tu@email.com"
                            autoComplete="email"
                            required
                            className={cn(
                                'pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl',
                                'placeholder:text-muted-foreground transition-colors duration-200',
                                'focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)]/30'
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="client-password" className="text-muted-foreground text-sm font-medium">
                            Contraseña
                        </Label>
                        <Link
                            href={`/forgot-password?coach_slug=${coachSlug}`}
                            className="text-xs font-medium hover:underline"
                            style={{ color: primaryColor }}
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            id="client-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            className={cn(
                                'pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl',
                                'placeholder:text-muted-foreground transition-colors duration-200',
                                'focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)]/30'
                            )}
                        />
                    </div>
                </div>

                {state?.error && (
                    <div className="animate-fade-in rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                        {state.error}
                    </div>
                )}

                <div className="pt-2">
                    <SubmitButton primaryColor={primaryColor} />
                </div>
            </form>
        </div>
    )
}
