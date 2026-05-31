'use client'

import { useEffect, useState } from 'react'
import { refreshOrgHealthScoreAction } from '../../_actions/org.actions'
import type { OrgHealthBreakdown } from '@/infrastructure/db/org.repository'

interface Props {
    orgSlug: string
    initialScore: number | null
}

export function OrgHealthScoreRefresher({ orgSlug, initialScore }: Props) {
    const [breakdown, setBreakdown] = useState<OrgHealthBreakdown | null>(null)

    useEffect(() => {
        refreshOrgHealthScoreAction(orgSlug)
            .then(result => { if (result) setBreakdown(result) })
            .catch(() => undefined)
    }, [orgSlug])

    const score = breakdown?.score ?? initialScore
    const tier = breakdown?.tier ?? (score !== null ? (score >= 70 ? 'green' : score >= 50 ? 'amber' : 'red') : null)

    const tierColor = tier === 'green' ? 'text-emerald-300' : tier === 'amber' ? 'text-amber-300' : 'text-red-400'
    const barColor = tier === 'green' ? 'bg-emerald-400' : tier === 'amber' ? 'bg-amber-400' : 'bg-red-400'

    if (score === null) return null

    return (
        <div className="space-y-1">
            <div className="flex items-end gap-2">
                <p className={`text-5xl font-black ${tierColor}`}>{score}</p>
                <p className="mb-1 text-sm text-zinc-500">/100</p>
            </div>
            {breakdown && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-zinc-500 mt-1">
                    <span>Adherencia 7d: <span className="text-zinc-300">{breakdown.adherence7d}%</span></span>
                    <span>Asignados: <span className="text-zinc-300">{breakdown.assignmentRate}%</span></span>
                    <span>Activos: <span className="text-zinc-300">{breakdown.activeRate}%</span></span>
                    <span>Con programa: <span className="text-zinc-300">{breakdown.programRate}%</span></span>
                </div>
            )}
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
                <div
                    className={`h-1.5 rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${Math.min(100, score)}%` }}
                />
            </div>
        </div>
    )
}
