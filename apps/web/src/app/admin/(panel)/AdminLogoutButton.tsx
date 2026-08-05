'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function AdminLogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
    const router = useRouter()
    const supabase = createClient()

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/admin/login')
        router.refresh()
    }

    if (iconOnly) {
        return (
            <button
                onClick={handleSignOut}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-[var(--danger-500)] hover:bg-surface-sunken transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
                <LogOut className="h-3.5 w-3.5" />
            </button>
        )
    }

    return (
        <Button
            onClick={handleSignOut}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted hover:text-strong"
        >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Cerrar sesión
        </Button>
    )
}
