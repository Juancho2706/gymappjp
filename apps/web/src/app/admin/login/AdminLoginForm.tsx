'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { safeNext } from '@/lib/auth/safe-next'
import { adminLoginAction } from './_actions/login.actions'

export function AdminLoginForm({ next }: { next?: string }) {
    const [showPassword, setShowPassword] = useState(false)
    const [state, formAction, pending] = useActionState(adminLoginAction, {})
    // Defensa en profundidad: la page ya valida y la server action revalida, pero el componente
    // no confía en su prop — el hidden nunca lleva un destino que la action fuera a descartar.
    const safe = safeNext(next, '/admin')

    return (
        <form action={formAction} className="space-y-4">
            {safe && <input type="hidden" name="next" value={safe} />}
            <div>
                <Label htmlFor="email" className="text-body">Email</Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    className="mt-1 bg-surface-sunken border-subtle text-strong"
                    placeholder="admin@eva-app.cl"
                />
            </div>
            <div>
                <Label htmlFor="password" className="text-body">Contraseña</Label>
                <div className="relative mt-1">
                    <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        className="bg-surface-sunken border-subtle text-strong pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] rounded"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>
            {state.error && (
                <p role="alert" aria-live="assertive" className="text-sm text-[var(--danger-500)]">
                    {state.error}
                </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Entrando...' : 'Entrar al Panel CEO'}
            </Button>
            <p className="text-center text-xs text-muted">
                <Link href="/forgot-password" className="underline underline-offset-2 hover:text-body">
                    ¿Olvidaste tu contraseña?
                </Link>
            </p>
        </form>
    )
}
