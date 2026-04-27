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
                className="flex h-8 w-8 items-center justify-center rounded text-[--admin-text-3] hover:text-[--admin-red] hover:bg-[--admin-bg-elevated] transition-colors"
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
            className="w-full justify-start text-xs text-neutral-400 hover:text-neutral-100"
        >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Cerrar sesión
        </Button>
    )
}
