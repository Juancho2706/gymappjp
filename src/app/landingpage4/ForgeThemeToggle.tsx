'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ForgeThemeToggle({ className }: { className?: string }) {
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <span className={cn('inline-flex h-9 w-9 shrink-0 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface)]', className)} aria-hidden />
    }

    const isDark = resolvedTheme === 'dark'

    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
                'shrink-0 border-[var(--forge-border)] bg-[var(--forge-surface)] text-[var(--forge-ink)] hover:bg-[var(--forge-surface-alt)]',
                className
            )}
            aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            aria-pressed={isDark}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
    )
}
