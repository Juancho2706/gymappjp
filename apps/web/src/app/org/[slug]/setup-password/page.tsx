'use client'

import { useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'

export default function SetupPasswordPage() {
    const params = useParams<{ slug: string }>()
    const router = useRouter()
    const slug = params.slug

    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPwd, setShowPwd] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [pending, startTransition] = useTransition()

    function validate() {
        if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
        if (password !== confirm) return 'Las contraseñas no coinciden'
        return null
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const err = validate()
        if (err) { setError(err); return }
        setError(null)
        startTransition(async () => {
            const supabase = createClient()
            const { error: updateError } = await supabase.auth.updateUser({ password })
            if (updateError) { setError(updateError.message); return }

            // Clear the requires_password_change flag — service role needed
            // We do it via an API call to a dedicated action
            try {
                await fetch(`/api/org/clear-password-requirement`, { method: 'POST' })
            } catch {
                // non-fatal: flag will remain but password is already changed
            }

            setDone(true)
            setTimeout(() => router.replace(`/org/${slug}`), 1500)
        })
    }

    return (
        <div className="min-h-dvh bg-zinc-950 flex items-center justify-center px-4 pb-safe">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/30">
                        <KeyRound className="h-7 w-7 text-amber-300" />
                    </div>
                    <h1 className="mt-4 text-2xl font-black text-white">Cambia tu contraseña</h1>
                    <p className="mt-2 text-sm text-zinc-500">
                        Tu cuenta fue creada con una contraseña temporal. Debes establecer una nueva antes de continuar.
                    </p>
                </div>

                {done ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />
                        <p className="mt-3 font-bold text-emerald-300">Contraseña actualizada</p>
                        <p className="mt-1 text-xs text-zinc-500">Redirigiendo al dashboard...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                    Nueva contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPwd ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 pr-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none"
                                        placeholder="Mínimo 8 caracteres"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPwd(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                    >
                                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                    Confirmar contraseña
                                </label>
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    required
                                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none"
                                    placeholder="Repite la contraseña"
                                />
                            </div>
                        </div>

                        <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-zinc-500" />
                            <p className="text-xs text-zinc-500 leading-5">
                                Esta contraseña reemplaza la temporal que te enviaron. Usala para todos tus próximos ingresos a esta organización.
                            </p>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                        >
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                            Establecer nueva contraseña
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
