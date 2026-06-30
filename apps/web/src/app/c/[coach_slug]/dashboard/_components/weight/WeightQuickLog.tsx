'use client'

import { useActionState, useEffect, useRef } from 'react'
import { quickLogWeightAction, type QuickWeightState } from '../../_actions/dashboard.actions'

const initial: QuickWeightState = {}

export function WeightQuickLog({ coachSlug }: { coachSlug: string }) {
    const [state, formAction, pending] = useActionState(quickLogWeightAction, initial)
    // Ref en vez de getElementById: el widget se monta 2× (árbol móvil + árbol desktop), un id
    // estático colisionaría y limpiaría el input equivocado. El ref es local a cada instancia.
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!state.success) return
        if (inputRef.current) inputRef.current.value = ''
    }, [state.success])

    return (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-subtle pt-3">
            <input type="hidden" name="coach_slug" value={coachSlug} />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] font-semibold text-muted">Peso rápido (kg)</span>
                <input
                    ref={inputRef}
                    name="weight"
                    type="number"
                    step="0.1"
                    min={20}
                    max={400}
                    required
                    className="h-11 min-h-[44px] rounded-control border-[1.5px] border-subtle bg-surface-sunken px-3 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus-visible:border-sport-500"
                    placeholder="72.5"
                    disabled={pending}
                />
            </label>
            <button
                type="submit"
                disabled={pending}
                className="h-11 min-h-[44px] min-w-[44px] rounded-control bg-[var(--cta-fill)] px-4 text-xs font-bold text-on-sport transition-[transform,background-color] active:scale-[0.97] disabled:opacity-50"
            >
                {pending ? '…' : 'Guardar'}
            </button>
            {state.error ? <p className="w-full text-xs font-semibold text-[var(--danger-600)]">{state.error}</p> : null}
            {state.success ? <p className="w-full text-xs font-semibold text-[var(--success-700)]">Registrado.</p> : null}
        </form>
    )
}
