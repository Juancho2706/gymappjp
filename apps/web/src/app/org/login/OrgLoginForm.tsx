'use client'

import { useActionState } from 'react'
import { Building2, Loader2, LogIn } from 'lucide-react'
import { loginOrgAction, type OrgLoginState } from './_actions/login.actions'

const initialState: OrgLoginState = {}

export function OrgLoginForm() {
    const [state, formAction, pending] = useActionState(loginOrgAction, initialState)

    return (
        <form action={formAction} className="mt-8 space-y-5">
            <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-foreground">
                    Email organizacional
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    placeholder="admin@gimnasio.cl"
                />
            </div>

            <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold text-foreground">
                    Contraseña
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    placeholder="••••••••••••"
                />
            </div>

            {state.error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    {state.error}
                </p>
            ) : null}

            <button
                type="submit"
                disabled={pending}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Ingresar al panel
            </button>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0 text-primary" />
                Acceso restringido a administradores y dueños de organizaciones.
            </div>
        </form>
    )
}
