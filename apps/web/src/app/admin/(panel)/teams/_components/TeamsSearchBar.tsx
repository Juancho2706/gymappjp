'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useRef, useTransition } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Busqueda de equipos por nombre o slug. Vive en la URL (?q=) para que el filtrado
 * sea server-side (teams.queries) — mismo patron Enter/blur que CoachFilterBar.
 */
export function TeamsSearchBar() {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const inputRef = useRef<HTMLInputElement>(null)

    function push(value: string) {
        const next = value.trim()
        if (next === (sp.get('q') ?? '')) return
        const params = new URLSearchParams(sp.toString())
        if (next) params.set('q', next)
        else params.delete('q')
        const qs = params.toString()
        startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
    }

    function reset() {
        if (inputRef.current) inputRef.current.value = ''
        startTransition(() => router.push(pathname))
    }

    return (
        <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                <input
                    ref={inputRef}
                    type="search"
                    aria-label="Buscar equipos por nombre o slug"
                    defaultValue={sp.get('q') ?? ''}
                    placeholder="Buscar nombre o slug..."
                    onKeyDown={e => {
                        if (e.key === 'Enter') push((e.target as HTMLInputElement).value)
                    }}
                    onBlur={e => push(e.target.value)}
                    className="w-48 rounded border border-subtle bg-surface-sunken py-1.5 pl-6 pr-2 text-xs text-body transition-colors placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none sm:w-56"
                />
            </div>

            {sp.has('q') && (
                <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted transition-colors hover:bg-surface-sunken hover:text-body focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    <X className="h-3 w-3" />
                    Reset
                </button>
            )}
        </div>
    )
}
