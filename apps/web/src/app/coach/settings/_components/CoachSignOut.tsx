'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Cierre de sesión del coach — cliente Supabase (mismo patrón que AdminLogoutButton /
 * OrgSignOutButton) + vuelta a /login. Reutilizado por el hub móvil de Opciones
 * (CoachSignOutCard) y por el rail de la SettingsShell (desktop, ver CoachSettingsDesktop).
 * No requiere confirmación: es reversible (basta volver a entrar).
 */
export function useCoachSignOut() {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const signOut = () => {
        startTransition(async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
        })
    }
    return { signOut, pending }
}

/**
 * Fila "Cerrar sesión" del hub móvil de Opciones — mismo patrón visual que HubCard
 * (tile de icono + título + descripción) pero como botón de acción (no navegación).
 * Tono NEUTRO a propósito: la acción destructiva/roja es "Eliminar cuenta" (DangerZone).
 */
export function CoachSignOutCard() {
    const { signOut, pending } = useCoachSignOut()
    return (
        <button
            type="button"
            onClick={signOut}
            disabled={pending}
            aria-label="Cerrar sesión"
            className="group flex w-full items-center gap-3.5 rounded-card border border-subtle bg-surface-card p-4 text-left transition-all hover:border-[var(--sport-300)] hover:shadow-[var(--shadow-sm)] disabled:opacity-60"
        >
            <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-control"
                style={{ background: 'var(--surface-sunken)', color: 'var(--ink-700)' }}
            >
                {pending ? (
                    <Loader2 className="h-[22px] w-[22px] animate-spin" />
                ) : (
                    <LogOut className="h-[22px] w-[22px]" />
                )}
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-strong">Cerrar sesión</h3>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                    Salir de tu cuenta en este dispositivo
                </p>
            </div>
        </button>
    )
}
