'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, CheckCircle2, Loader2, Zap } from 'lucide-react'
import { bulkAssignSelectedClientsAction } from '../../_actions/org.actions'

export interface AutopilotSuggestion {
    fromCoachId: string
    fromCoachName: string
    toCoachId: string
    toCoachName: string
    clientIds: string[]
    clientNames: string[]
    count: number
    fromLoad: number
}

interface Props {
    orgSlug: string
    suggestions: AutopilotSuggestion[]
}

function SuggestionRow({
    orgSlug,
    suggestion,
}: {
    orgSlug: string
    suggestion: AutopilotSuggestion
}) {
    const [done, setDone] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleApprove() {
        setError(null)
        startTransition(async () => {
            const res = await bulkAssignSelectedClientsAction(orgSlug, suggestion.clientIds, suggestion.toCoachId)
            if (res?.error) setError(res.error)
            else setDone(true)
        })
    }

    if (done) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">{suggestion.count} alumnos reasignados de {suggestion.fromCoachName} → {suggestion.toCoachName}</span>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-red-300">{suggestion.fromCoachName}</span>
                        <span className="text-xs text-zinc-500">({suggestion.fromLoad}% carga)</span>
                        <ArrowRight className="h-3 w-3 text-zinc-600" />
                        <span className="text-sm font-bold text-emerald-300">{suggestion.toCoachName}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                        Mover {suggestion.count} alumno{suggestion.count !== 1 ? 's' : ''}:{' '}
                        {suggestion.clientNames.slice(0, 3).join(', ')}
                        {suggestion.clientNames.length > 3 && ` +${suggestion.clientNames.length - 3} más`}
                    </p>
                </div>
                <button
                    onClick={handleApprove}
                    disabled={pending}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aprobar
                </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
    )
}

export function CapacityAutopilotCard({ orgSlug, suggestions }: Props) {
    if (suggestions.length === 0) return null

    return (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
            <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-300" aria-hidden="true" />
                <h2 className="text-lg font-black text-white">Capacity Autopilot</h2>
                <span className="ml-auto rounded-full bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-xs font-bold text-amber-300">
                    {suggestions.length} sugerencia{suggestions.length !== 1 ? 's' : ''}
                </span>
            </div>
            <p className="text-xs text-amber-300/70 mb-4">
                Coaches sobrecargados detectados. Sugerencias de rebalanceo con aprobación manual. Cada reasignación queda en el audit log.
            </p>
            <div className="space-y-3">
                {suggestions.map((s, i) => (
                    <SuggestionRow key={`${s.fromCoachId}-${s.toCoachId}-${i}`} orgSlug={orgSlug} suggestion={s} />
                ))}
            </div>
        </section>
    )
}
