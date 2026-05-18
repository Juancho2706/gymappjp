'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import type { AdherenceStat, NutritionStat } from '../../_data/types'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    adherenceStats: AdherenceStat[]
    nutritionStats: NutritionStat[]
}

type Tab = 'adherence' | 'nutrition'

export function ClientStatsSheet({ open, onOpenChange, adherenceStats, nutritionStats }: Props) {
    const [tab, setTab] = useState<Tab>('adherence')

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

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="font-display text-xl">Detalle por alumno</SheetTitle>
                    <SheetDescription>Ordenado de menor a mayor cumplimiento.</SheetDescription>
                </SheetHeader>

                <div className="mt-4 flex gap-2 px-4">
                    <TabButton active={tab === 'adherence'} onClick={() => setTab('adherence')}>Adherencia</TabButton>
                    <TabButton active={tab === 'nutrition'} onClick={() => setTab('nutrition')}>Nutricion</TabButton>
                </div>

                <div className="mt-4 flex flex-col gap-3 overflow-y-auto px-4 pb-6">
                    {sorted.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Sin datos.</p>
                    ) : (
                        sorted.map((r) => (
                            <Link
                                key={r.clientId}
                                href={`/coach/clients/${r.clientId}`}
                                className="rounded-xl border border-border/50 bg-background/40 p-3 transition-colors hover:bg-primary/5"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold">{r.name}</span>
                                    <span className="text-sm font-bold">{r.pct}%</span>
                                </div>
                                <Progress value={r.pct} className="mt-2 h-1.5" />
                                <p className="mt-1 truncate text-xs text-muted-foreground">{r.hint}</p>
                            </Link>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
            style={active ? { backgroundColor: 'var(--theme-primary, #007AFF)', color: '#fff' } : undefined}
        >
            {children}
        </button>
    )
}
