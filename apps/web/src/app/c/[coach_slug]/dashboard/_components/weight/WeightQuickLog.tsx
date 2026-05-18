'use client'

import { useActionState, useEffect } from 'react'
import { quickLogWeightAction, type QuickWeightState } from '../../_actions/dashboard.actions'

const initial: QuickWeightState = {}

export function WeightQuickLog({ coachSlug }: { coachSlug: string }) {
    const [state, formAction, pending] = useActionState(quickLogWeightAction, initial)

    useEffect(() => {
        if (!state.success) return
        const el = document.getElementById('dash-quick-weight') as HTMLInputElement | null
        if (el) el.value = ''
    }, [state.success])

    return (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/40 pt-3">
            <input type="hidden" name="coach_slug" value={coachSlug} />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">Peso rápido (kg)</span>
                <input
                    id="dash-quick-weight"
                    name="weight"
                    type="number"
                    step="0.1"
                    min={20}
                    max={400}
                    required
                    className="h-11 min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm"
                    placeholder="72.5"
                    disabled={pending}
                />
            </label>
            <button
                type="submit"
                disabled={pending}
                className="h-11 min-h-[44px] min-w-[44px] rounded-lg bg-[color:var(--theme-primary)] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
                {pending ? '…' : 'Guardar'}
            </button>
            {state.error ? <p className="w-full text-xs text-destructive">{state.error}</p> : null}
            {state.success ? <p className="w-full text-xs text-emerald-600 dark:text-emerald-400">Registrado.</p> : null}
        </form>
    )
}
