'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { AdherenceStat, NutritionStat } from '../../_data/types'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    adherenceStats: AdherenceStat[]
    nutritionStats: NutritionStat[]
}

type Tab = 'adherence' | 'nutrition'

function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 760px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que el Asignar de Programas): desktop → side sheet, móvil → bottom sheet. */
function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribeMd,
        () => window.matchMedia('(min-width: 760px)').matches,
        () => true
    )
}

/** §4.2 — color por cumplimiento (sport ≥75 / warning ≥50 / danger). */
function barColor(pct: number) {
    return pct >= 75 ? 'var(--sport-500)' : pct >= 50 ? 'var(--warning-500)' : 'var(--danger-500)'
}

export function ClientStatsSheet({ open, onOpenChange, adherenceStats, nutritionStats }: Props) {
    const [tab, setTab] = useState<Tab>('adherence')
    const isDesktop = useIsDesktopMd()

    const rows =
        tab === 'adherence'
            ? adherenceStats.map((s) => ({
                  clientId: s.clientId,
                  name: s.clientName,
                  pct: s.percentage,
                  hint: `${s.completedSets}/${s.totalSets} sets · ${s.lastPlan}`,
              }))
            : nutritionStats.map((s) => ({
                  clientId: s.clientId,
                  name: s.clientName,
                  pct: s.percentage,
                  hint: `${Math.round(s.consumed.cal)} / ${Math.round(s.target.cal)} kcal`,
              }))

    const sorted = [...rows].sort((a, b) => a.pct - b.pct)
    const avg = sorted.length
        ? Math.round(sorted.reduce((acc, r) => acc + r.pct, 0) / sorted.length)
        : 0

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isDesktop ? 'right' : 'bottom'}
                showCloseButton={isDesktop}
                className={
                    isDesktop
                        ? 'w-full gap-0 border-subtle bg-surface-card p-0 text-body sm:max-w-lg'
                        : 'max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body'
                }
            >
                <div
                    className={`flex flex-col overflow-y-auto overscroll-contain px-[18px] ${
                        isDesktop
                            ? 'h-full pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'
                            : 'max-h-[min(88dvh,88svh)] pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
                    }`}
                >
                    {!isDesktop && (
                        <div
                            className="mx-auto mb-3.5 h-1 w-[38px] shrink-0 rounded-pill bg-[var(--ink-200)]"
                            aria-hidden="true"
                        />
                    )}
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="sr-only">Detalle por alumno</SheetTitle>
                        <SheetDescription className="sr-only">
                            Ordenado por menor cumplimiento — los que necesitan ayuda primero.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mb-1 flex items-center justify-between">
                        <div className="font-display text-[19px] font-extrabold text-strong">
                            Detalle por alumno
                        </div>
                        <div className="eva-metric text-[20px]" style={{ color: barColor(avg) }}>
                            {avg}%
                        </div>
                    </div>

                    <div className="mb-3.5 flex shrink-0 gap-[2px] rounded-control bg-surface-sunken p-[3px]">
                        {(
                            [
                                ['adherence', 'Adherencia'],
                                ['nutrition', 'Nutrición'],
                            ] as Array<[Tab, string]>
                        ).map(([k, lbl]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setTab(k)}
                                className={`h-9 flex-1 rounded-[calc(var(--radius-control)-3px)] font-ui text-[13.5px] font-bold transition-colors ${
                                    tab === k
                                        ? 'bg-surface-card text-strong shadow-[var(--shadow-xs)]'
                                        : 'bg-transparent text-subtle'
                                }`}
                            >
                                {lbl}
                            </button>
                        ))}
                    </div>

                    <div className="mb-2.5 text-[11.5px] text-subtle">
                        Ordenado por menor cumplimiento — los que necesitan ayuda primero.
                    </div>

                    <div className="-mx-1 flex min-h-0 flex-col gap-[2px] overflow-y-auto">
                        {sorted.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted">Sin datos.</p>
                        ) : (
                            sorted.map((r) => (
                                <Link
                                    key={r.clientId}
                                    href={`/coach/clients/${r.clientId}`}
                                    onClick={() => onOpenChange(false)}
                                    className="flex items-center gap-3 px-1 py-2.5 text-left"
                                >
                                    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-sm font-extrabold text-sport-400">
                                        {r.name[0]}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-[5px] flex items-baseline justify-between">
                                            <span className="truncate text-[13.5px] font-bold text-strong">
                                                {r.name}
                                            </span>
                                            <span
                                                className="eva-mono ml-2 shrink-0 text-[12.5px] font-extrabold"
                                                style={{ color: barColor(r.pct) }}
                                            >
                                                {r.pct}%
                                            </span>
                                        </div>
                                        <div className="h-[5px] w-full overflow-hidden rounded-pill bg-[var(--track)]">
                                            <div
                                                className="h-full rounded-pill"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, r.pct))}%`,
                                                    background: barColor(r.pct),
                                                }}
                                            />
                                        </div>
                                        <div className="mt-1 text-[11px] text-subtle">{r.hint}</div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
