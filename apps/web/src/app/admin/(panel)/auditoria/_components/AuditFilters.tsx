'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ADMIN_ACTION_CATALOG, ADMIN_ACTION_GROUPS } from '../../_components/admin-action-catalog'

const FIELD =
    'rounded border border-subtle bg-surface-sunken px-2 py-1.5 text-xs text-body placeholder:text-muted transition-colors focus:border-[var(--sport-500)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'

const PRESET_BTN =
    'rounded-pill border border-subtle bg-surface-sunken px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-[var(--sport-500)] hover:text-strong focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none'

const DEBOUNCE_MS = 300

/** Presets de rango: `days` cuenta hacia atrás incluyendo hoy (Hoy = 1). */
const PRESETS = [
    { label: 'Hoy', days: 1 },
    { label: '7d', days: 7 },
    { label: '30d', days: 30 },
]

function toDateInput(date: Date): string {
    return format(date, 'yyyy-MM-dd')
}

export function AuditFilters() {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const spAction = sp.get('action') ?? ''
    const spAdmin = sp.get('admin') ?? ''
    const spTarget = sp.get('target') ?? ''
    const spFrom = sp.get('from') ?? ''
    const spTo = sp.get('to') ?? ''

    // Los inputs de texto son controlados localmente y sincronizan la URL con debounce; antes cada
    // tecla disparaba un router.push (un round-trip al servidor por carácter).
    const [adminInput, setAdminInput] = useState(spAdmin)
    const [targetInput, setTargetInput] = useState(spTarget)
    const [rangeWarning, setRangeWarning] = useState(false)

    useEffect(() => setAdminInput(spAdmin), [spAdmin])
    useEffect(() => setTargetInput(spTarget), [spTarget])

    const adminTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const targetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(
        () => () => {
            if (adminTimer.current) clearTimeout(adminTimer.current)
            if (targetTimer.current) clearTimeout(targetTimer.current)
        },
        []
    )

    const pushParams = useCallback(
        (mutate: (params: URLSearchParams) => void) => {
            const params = new URLSearchParams(sp.toString())
            mutate(params)
            params.delete('page')
            const qs = params.toString()
            startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
        },
        [sp, pathname, router]
    )

    const push = useCallback(
        (key: string, value: string) => {
            pushParams((params) => {
                if (value) params.set(key, value)
                else params.delete(key)
            })
        },
        [pushParams]
    )

    function pushDebounced(ref: React.RefObject<ReturnType<typeof setTimeout> | null>, key: string, value: string) {
        if (ref.current) clearTimeout(ref.current)
        ref.current = setTimeout(() => push(key, value), DEBOUNCE_MS)
    }

    /** `to` anterior a `from` se descarta (queda el rango abierto) en vez de devolver cero filas. */
    function changeRange(key: 'from' | 'to', value: string) {
        const nextFrom = key === 'from' ? value : spFrom
        const nextTo = key === 'to' ? value : spTo
        const invalid = Boolean(nextFrom && nextTo && nextTo < nextFrom)
        setRangeWarning(invalid)
        pushParams((params) => {
            if (nextFrom) params.set('from', nextFrom)
            else params.delete('from')
            if (nextTo && !invalid) params.set('to', nextTo)
            else params.delete('to')
        })
    }

    function applyPreset(days: number) {
        const today = new Date()
        const start = new Date()
        start.setDate(start.getDate() - (days - 1))
        setRangeWarning(false)
        pushParams((params) => {
            params.set('from', toDateInput(start))
            params.set('to', toDateInput(today))
        })
    }

    function reset() {
        setRangeWarning(false)
        if (adminTimer.current) clearTimeout(adminTimer.current)
        if (targetTimer.current) clearTimeout(targetTimer.current)
        setAdminInput('')
        setTargetInput('')
        startTransition(() => router.push(pathname))
    }

    const hasFilters = Boolean(spAction || spAdmin || spFrom || spTo || spTarget)
    const unknownAction = Boolean(spAction) && !(spAction in ADMIN_ACTION_CATALOG)

    return (
        <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
            <select
                aria-label="Filtrar por acción"
                value={spAction}
                onChange={(e) => push('action', e.target.value)}
                className={`${FIELD} max-w-[180px] sm:max-w-none`}
            >
                <option value="">Todas las acciones</option>
                {/* Acción llegada por URL que no está en el catálogo: se ofrece cruda para no perder la selección. */}
                {unknownAction && <option value={spAction}>{spAction}</option>}
                {ADMIN_ACTION_GROUPS.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                        {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>

            <input
                type="text"
                inputMode="email"
                value={adminInput}
                onChange={(e) => {
                    setAdminInput(e.target.value)
                    pushDebounced(adminTimer, 'admin', e.target.value.trim())
                }}
                placeholder="Admin (email)..."
                aria-label="Filtrar por email del admin"
                className={`${FIELD} w-40 sm:w-48`}
            />

            <div className="flex items-center gap-1">
                {PRESETS.map((preset) => (
                    <button key={preset.label} type="button" onClick={() => applyPreset(preset.days)} className={PRESET_BTN}>
                        {preset.label}
                    </button>
                ))}
            </div>

            <input
                type="date"
                value={spFrom}
                onChange={(e) => changeRange('from', e.target.value)}
                aria-label="Desde"
                className={`${FIELD} w-36`}
            />

            <input
                type="date"
                value={spTo}
                onChange={(e) => changeRange('to', e.target.value)}
                aria-label="Hasta"
                className={`${FIELD} w-36`}
            />

            <input
                type="text"
                value={targetInput}
                onChange={(e) => {
                    setTargetInput(e.target.value)
                    pushDebounced(targetTimer, 'target', e.target.value.trim())
                }}
                placeholder="UUID target..."
                aria-label="Filtrar por UUID del target"
                className={`${FIELD} w-40 sm:w-48`}
            />

            {rangeWarning && (
                <span role="status" className="text-[11px] text-[var(--warning-500)]">
                    &laquo;Hasta&raquo; es anterior a &laquo;Desde&raquo; — se ignoró.
                </span>
            )}

            {hasFilters && (
                <button
                    type="button"
                    onClick={reset}
                    className="rounded px-2 py-1.5 text-xs text-muted transition-colors hover:text-body focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
                >
                    Reset
                </button>
            )}
        </div>
    )
}
