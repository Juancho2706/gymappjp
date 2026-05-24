'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Props = {
    compact?: boolean
}

export function OrgSignOutButton({ compact = false }: Props) {
    const router = useRouter()

    async function handleSignOut() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/org/login')
        router.refresh()
    }

    return (
        <button
            type="button"
            onClick={handleSignOut}
            className={cn(
                'flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-destructive',
                compact ? 'h-9 w-9 justify-center rounded-lg border border-zinc-800 bg-zinc-900' : 'w-full'
            )}
            aria-label="Cerrar sesion"
        >
            <LogOut className="h-3 w-3 shrink-0" />
            {!compact && 'Cerrar sesion'}
        </button>
    )
}
