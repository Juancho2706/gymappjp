'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function OrgSignOutButton() {
    const router = useRouter()

    async function handleSignOut() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/org/login')
        router.refresh()
    }

    return (
        <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
        >
            <LogOut className="w-3 h-3 shrink-0" />
            Cerrar sesión
        </button>
    )
}
