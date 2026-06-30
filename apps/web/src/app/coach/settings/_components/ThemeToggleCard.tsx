'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

/**
 * Segmented Claro/Oscuro — réplica 1:1 del ThemeToggleCard del UI kit (extras.jsx).
 * Usa next-themes (attribute=class) ya montado en el layout raíz.
 */
export function ThemeToggleCard() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    const current = mounted && theme === 'dark' ? 'dark' : 'light'
    const opts = [
        { val: 'light', label: 'Claro', Icon: Sun },
        { val: 'dark', label: 'Oscuro', Icon: Moon },
    ] as const

    return (
        <div className="rounded-card border border-subtle bg-surface-card p-3">
            <div
                role="tablist"
                aria-label="Tema de la app"
                className="flex gap-1.5 rounded-control p-1"
                style={{ background: 'var(--surface-sunken)' }}
            >
                {opts.map(({ val, label, Icon }) => {
                    const active = current === val
                    return (
                        <button
                            key={val}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setTheme(val)}
                            className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-control text-[14.5px] font-bold transition-colors"
                            style={{
                                background: active ? 'var(--surface-card)' : 'transparent',
                                color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                            }}
                        >
                            <Icon className="h-[18px] w-[18px]" />
                            {label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
