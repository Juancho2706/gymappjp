'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Search, X, RefreshCw } from 'lucide-react'

const STATUS_OPTIONS = [
    { value: 'active',           label: 'Activo' },
    { value: 'trialing',         label: 'Trial' },
    { value: 'expired',          label: 'Expirado' },
    { value: 'canceled',         label: 'Cancelado' },
    { value: 'past_due',         label: 'Cobro fallido' },
    { value: 'paused',           label: 'Suspendido' },
]

const TIER_OPTIONS = [
    { value: 'starter', label: 'Starter' },
    { value: 'pro',     label: 'Pro' },
    { value: 'elite',   label: 'Elite' },
    { value: 'scale',   label: 'Scale' },
]

const PROVIDER_OPTIONS = [
    { value: 'beta',         label: 'Beta' },
    { value: 'mercadopago',  label: 'MercadoPago' },
    { value: 'stripe',       label: 'Stripe' },
]

export function CoachFilterBar() {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const searchRef = useRef<HTMLInputElement>(null)

    function push(key: string, value: string) {
        const params = new URLSearchParams(sp.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete('page')
        startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }

    function reset() {
        if (searchRef.current) searchRef.current.value = ''
        startTransition(() => router.push(pathname))
    }

    const hasFilters = sp.has('q') || sp.has('status') || sp.has('tier') || sp.has('provider') || sp.has('beta')

    const selectClass = "rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 py-1.5 text-xs text-[--admin-text-2] focus:outline-none focus:border-[--admin-accent] transition-colors"

    return (
        <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
            {/* Search */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[--admin-text-3]" />
                <input
                    ref={searchRef}
                    type="text"
                    defaultValue={sp.get('q') ?? ''}
                    placeholder="Buscar nombre, brand, slug..."
                    onKeyDown={e => {
                        if (e.key === 'Enter') push('q', (e.target as HTMLInputElement).value)
                    }}
                    onBlur={e => push('q', e.target.value)}
                    className="rounded border border-[--admin-border] bg-[--admin-bg-elevated] pl-6 pr-2 py-1.5 text-xs text-[--admin-text-2] placeholder:text-[--admin-text-3] focus:outline-none focus:border-[--admin-accent] w-48 sm:w-56 transition-colors"
                />
            </div>

            {/* Status */}
            <select
                value={sp.get('status') ?? ''}
                onChange={e => push('status', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className={selectClass}
            >
                <option value="">Todos los status</option>
                {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Tier */}
            <select
                value={sp.get('tier') ?? ''}
                onChange={e => push('tier', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className={selectClass}
            >
                <option value="">Todos los tiers</option>
                {TIER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Provider */}
            <select
                value={sp.get('provider') ?? ''}
                onChange={e => push('provider', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className={selectClass}
            >
                <option value="">Todos los providers</option>
                {PROVIDER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Beta only toggle */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[--admin-text-3] hover:text-[--admin-text-2] transition-colors select-none">
                <input
                    type="checkbox"
                    checked={sp.get('beta') === 'true'}
                    onChange={e => push('beta', e.target.checked ? 'true' : '')}
                    className="rounded border-[--admin-border] accent-[--admin-accent]"
                />
                Solo beta
            </label>

            {/* Reset */}
            {hasFilters && (
                <button
                    onClick={reset}
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-[--admin-text-3] hover:text-[--admin-text-2] hover:bg-[--admin-bg-elevated] transition-colors"
                >
                    <X className="h-3 w-3" />
                    Reset
                </button>
            )}

            {/* Live refresh */}
            <button
                onClick={() => startTransition(() => router.refresh())}
                disabled={isPending}
                className="ml-auto flex items-center gap-1.5 rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2.5 py-1.5 text-xs text-[--admin-text-3] hover:text-[--admin-text-1] hover:border-[--admin-accent] transition-colors disabled:opacity-50"
                title="Actualizar datos desde la base de datos"
            >
                <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualizar</span>
            </button>
        </div>
    )
}
