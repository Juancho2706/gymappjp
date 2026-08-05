'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Search, X, RefreshCw } from 'lucide-react'
import { TIER_CONFIG } from '@eva/tiers'

const STATUS_OPTIONS = [
    { value: 'active',           label: 'Activo' },
    { value: 'trialing',         label: 'Trial' },
    { value: 'expired',          label: 'Expirado' },
    { value: 'canceled',         label: 'Cancelado' },
    { value: 'past_due',         label: 'Cobro fallido' },
    { value: 'paused',           label: 'Suspendido' },
]

// Union COMPLETO derivado de las constantes (mejora #7: NO re-hardcodear).
// Incluye growth/scale (LEGACY, fuera de venta) — filtrar cuentas grandfathered es correcto en el admin.
const TIER_OPTIONS = (Object.keys(TIER_CONFIG) as Array<keyof typeof TIER_CONFIG>).map(t => ({
    value: t,
    label: TIER_CONFIG[t].label,
}))

// Proveedores REALES de la DB (F0 08-05): flow y admin/internal existian y no se podian
// filtrar; stripe no opera en Chile y no tiene ninguna fila — fuera.
const PROVIDER_OPTIONS = [
    { value: 'mercadopago',  label: 'MercadoPago' },
    { value: 'flow',         label: 'Flow' },
    { value: 'admin',        label: 'Admin (cortesia)' },
    { value: 'internal',     label: 'Internal' },
    { value: 'beta',         label: 'Beta' },
]

const STAGE_OPTIONS = [
    { value: 'new_trial',       label: 'Trial nuevo' },
    { value: 'active_healthy',  label: 'Activo sano' },
    { value: 'active_atRisk',   label: 'En riesgo' },
    { value: 'expiring_soon',   label: 'Vence pronto' },
    { value: 'expired',         label: 'Expirado' },
    { value: 'churned',         label: 'Perdido' },
    { value: 'pending',         label: 'Pago pendiente' },
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

    const hasFilters = sp.has('q') || sp.has('status') || sp.has('tier') || sp.has('provider') || sp.has('beta') || sp.has('stage') || sp.has('atRisk')

    const selectClass = "rounded border border-subtle bg-surface-sunken px-2 py-1.5 text-xs text-body focus:outline-none focus:border-[var(--sport-500)] transition-colors"

    return (
        <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
            {/* Search */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                <input
                    ref={searchRef}
                    type="text"
                    defaultValue={sp.get('q') ?? ''}
                    placeholder="Buscar nombre, brand, slug..."
                    onKeyDown={e => {
                        if (e.key === 'Enter') push('q', (e.target as HTMLInputElement).value)
                    }}
                    onBlur={e => push('q', e.target.value)}
                    className="rounded border border-subtle bg-surface-sunken pl-6 pr-2 py-1.5 text-xs text-body placeholder:text-muted focus:outline-none focus:border-[var(--sport-500)] w-48 sm:w-56 transition-colors"
                />
            </div>

            {/* Status */}
            <select
                value={sp.get('status') ?? ''}
                onChange={e => push('status', e.target.value)}
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
                className={selectClass}
            >
                <option value="">Todos los providers</option>
                {PROVIDER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Lifecycle stage */}
            <select
                value={sp.get('stage') ?? ''}
                onChange={e => push('stage', e.target.value)}
                className={selectClass}
            >
                <option value="">Ciclo de vida</option>
                {STAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* At-risk quick toggle */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--warning-500)] hover:text-strong transition-colors select-none">
                <input
                    type="checkbox"
                    checked={sp.get('atRisk') === 'true'}
                    onChange={e => push('atRisk', e.target.checked ? 'true' : '')}
                    className="rounded border-subtle accent-[var(--warning-500)]"
                />
                Solo en riesgo
            </label>

            {/* Beta only toggle */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-body transition-colors select-none">
                <input
                    type="checkbox"
                    checked={sp.get('beta') === 'true'}
                    onChange={e => push('beta', e.target.checked ? 'true' : '')}
                    className="rounded border-subtle accent-[var(--sport-500)]"
                />
                Solo beta
            </label>

            {/* Reset */}
            {hasFilters && (
                <button
                    onClick={reset}
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted hover:text-body hover:bg-surface-sunken transition-colors"
                >
                    <X className="h-3 w-3" />
                    Reset
                </button>
            )}

            {/* Live refresh */}
            <button
                onClick={() => startTransition(() => router.refresh())}
                disabled={isPending}
                className="ml-auto flex items-center gap-1.5 rounded border border-subtle bg-surface-sunken px-2.5 py-1.5 text-xs text-muted hover:text-strong hover:border-[var(--sport-500)] transition-colors disabled:opacity-50"
                title="Actualizar datos desde la base de datos"
            >
                <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualizar</span>
            </button>
        </div>
    )
}
