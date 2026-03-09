'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
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

export default function ResetPasswordPage() {
    const [state, formAction] = useActionState(resetPasswordAction, initialState)

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
                <p className="mt-2 text-zinc-400 text-sm">
                    Elige una contraseña segura para tu cuenta
                </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                <form action={formAction} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-zinc-300 text-sm font-medium">
                            Nueva contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                required
                                minLength={8}
                                className="pl-10 h-12 bg-zinc-800 border-zinc-700 text-zinc-100 rounded-xl placeholder:text-zinc-600 focus:border-violet-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_password" className="text-zinc-300 text-sm font-medium">
                            Confirmar contraseña
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                            <Input
                                id="confirm_password"
                                name="confirm_password"
                                type="password"
                                placeholder="Repite tu contraseña"
                                required
                                className="pl-10 h-12 bg-zinc-800 border-zinc-700 text-zinc-100 rounded-xl placeholder:text-zinc-600 focus:border-violet-500"
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
                    href="/login"
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    Volver al inicio de sesión
                </Link>
            </div>
        </div>
    )
}
