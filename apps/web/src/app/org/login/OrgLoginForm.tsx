'use client'

import { useActionState } from 'react'
import { Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { loginOrgAction, type OrgLoginState } from './_actions/login.actions'

const initialState: OrgLoginState = {}

export function OrgLoginForm() {
  const [state, formAction, pending] = useActionState(loginOrgAction, initialState)

  return (
    <form action={formAction} noValidate>
      {/* Card header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            MFA requerido
          </span>
        </div>
        <h1 className="text-xl font-black tracking-tight text-zinc-100">Panel Enterprise</h1>
        <p className="mt-1 text-sm text-zinc-500">Acceso exclusivo a administradores de organización.</p>
      </div>

      <div className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Email organizacional
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-base text-zinc-100 outline-none placeholder:text-zinc-600 transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
            placeholder="admin@gimnasio.cl"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-base text-zinc-100 outline-none placeholder:text-zinc-600 transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
            placeholder="••••••••••••"
          />
        </div>

        {/* Error */}
        {state.error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3">
            <p className="text-sm font-medium text-red-400">{state.error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-sm font-bold text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.3)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_4px_20px_rgba(245,158,11,0.45)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          {pending
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <LogIn className="h-4 w-4" aria-hidden />
          }
          Ingresar al panel
        </button>

        {/* Forgot password */}
        <div className="text-center">
          <a
            href="/forgot-password"
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </div>
    </form>
  )
}
