'use client'

import { useActionState } from 'react'
import { Building2, Loader2, Lock, Mail, Ticket } from 'lucide-react'
import { enterpriseCoachLoginAction, type EnterpriseCoachLoginState } from './_actions'

const initialState: EnterpriseCoachLoginState = {}

export function EnterpriseCoachLoginForm() {
    const [state, action, pending] = useActionState(enterpriseCoachLoginAction, initialState)

    return (
        <form action={action} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div>
                <label htmlFor="enterprise-code" className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Codigo Enterprise
                </label>
                <div className="relative">
                    <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input
                        id="enterprise-code"
                        name="code"
                        autoComplete="one-time-code"
                        required
                        placeholder="EVA-EMPRESA-123"
                        className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
                    />
                </div>
            </div>

            <div>
                <label htmlFor="enterprise-email" className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Email coach
                </label>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input
                        id="enterprise-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="coach@empresa.cl"
                        className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
                    />
                </div>
            </div>

            <div>
                <label htmlFor="enterprise-password" className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Contrasena
                </label>
                <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input
                        id="enterprise-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        placeholder="********"
                        className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
                    />
                </div>
            </div>

            {state.error && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                    {state.error}
                </div>
            )}

            <button
                type="submit"
                disabled={pending}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Building2 className="h-4 w-4" aria-hidden="true" />}
                {pending ? 'Validando...' : 'Entrar como Coach Enterprise'}
            </button>
        </form>
    )
}
