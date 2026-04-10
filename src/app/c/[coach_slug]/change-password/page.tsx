'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Lock, Loader2, ShieldCheck } from 'lucide-react'
import { changePasswordAction, type ChangePasswordState } from '../login/actions'
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
            className="btn-theme w-full h-12 rounded-xl text-base font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
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
            className="min-h-screen flex items-center justify-center p-4 pt-safe bg-background"
        >
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-theme-subtle border border-theme mb-4">
                        <ShieldCheck className="w-8 h-8 text-theme" />
                    </div>
                    <h1
                        className="text-2xl font-bold text-foreground"
                        style={{ fontFamily: 'var(--font-outfit)' }}
                    >
                        Crea tu contraseña
                    </h1>
                    <p className="mt-2 text-muted-foreground text-sm max-w-xs mx-auto">
                        Es tu primer acceso. Por seguridad, debes crear una contraseña propia.
                    </p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
                    <form action={formAction} className="space-y-5">
                        <input type="hidden" name="coach_slug" value={coach_slug} />

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
                                    className="pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl placeholder:text-muted-foreground"
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
                                    className="pl-10 h-12 bg-secondary border-border hover:border-accent text-foreground rounded-xl placeholder:text-muted-foreground"
                                />
                            </div>
                        </div>

                        {state?.error && (
                            <div className="animate-fade-in rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
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
