'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

const ACTIONS = [
    { value: 'coach.update',            label: 'Edición de coach' },
    { value: 'coach.suspend',           label: 'Coach suspendido' },
    { value: 'coach.force_expire',      label: 'Trial forzado expirado' },
    { value: 'coach.reactivate',        label: 'Reactivación manual' },
    { value: 'coach.period_extend',     label: 'Extensión de período' },
    { value: 'coach.period_end_update', label: 'Cambio de fecha' },
    { value: 'coach.bulk_status',       label: 'Cambio masivo status' },
    { value: 'coach.bulk_tier',         label: 'Cambio masivo tier' },
    { value: 'coach.delete',            label: 'Eliminación de coach' },
    { value: 'client.update',           label: 'Edición de alumno' },
    { value: 'client.delete',           label: 'Eliminación de alumno' },
]

export function AuditFilters() {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = useTransition()

    function push(key: string, value: string) {
        const params = new URLSearchParams(sp.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete('page')
        startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }

    function reset() {
        startTransition(() => router.push(pathname))
    }

    const hasFilters = sp.has('action') || sp.has('from') || sp.has('to') || sp.has('target')

    return (
        <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
            <select
                value={sp.get('action') ?? ''}
                onChange={e => push('action', e.target.value)}
                className="rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 py-1.5 text-xs text-[--admin-text-2] focus:outline-none focus:border-[--admin-accent]"
            >
                <option value="">Todas las acciones</option>
                {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                ))}
            </select>

            <input
                type="date"
                value={sp.get('from') ?? ''}
                onChange={e => push('from', e.target.value)}
                className="rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 py-1.5 text-xs text-[--admin-text-2] focus:outline-none focus:border-[--admin-accent]"
                placeholder="Desde"
            />

            <input
                type="date"
                value={sp.get('to') ?? ''}
                onChange={e => push('to', e.target.value)}
                className="rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 py-1.5 text-xs text-[--admin-text-2] focus:outline-none focus:border-[--admin-accent]"
                placeholder="Hasta"
            />

            <input
                type="text"
                value={sp.get('target') ?? ''}
                onChange={e => push('target', e.target.value)}
                placeholder="UUID target..."
                className="rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 py-1.5 text-xs text-[--admin-text-2] placeholder:text-[--admin-text-3] focus:outline-none focus:border-[--admin-accent] w-48"
            />

            {hasFilters && (
                <button
                    onClick={reset}
                    className="rounded px-2 py-1.5 text-xs text-[--admin-text-3] hover:text-[--admin-text-2] transition-colors"
                >
                    Reset
                </button>
            )}
        </div>
    )
}
