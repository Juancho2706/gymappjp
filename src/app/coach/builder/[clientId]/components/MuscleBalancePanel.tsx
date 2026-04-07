'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip
} from 'recharts'
import { getMuscleColor } from '../muscle-colors'
import type { DayState } from '../types'

interface MuscleBalancePanelProps {
    open: boolean
    onClose: () => void
    days: DayState[]
}

export function MuscleBalancePanel({ open, onClose, days }: MuscleBalancePanelProps) {
    const muscleSetMap: Record<string, number> = {}
    const muscleExMap: Record<string, number> = {}

    for (const day of days) {
        if (day.is_rest) continue
        for (const block of day.blocks) {
            const m = block.muscle_group || 'Otro'
            muscleSetMap[m] = (muscleSetMap[m] || 0) + (block.sets || 0)
            muscleExMap[m] = (muscleExMap[m] || 0) + 1
        }
    }

    // All muscles sorted by sets desc, then alpha
    const allMuscles = Object.keys(muscleSetMap).sort((a, b) => (muscleSetMap[b] || 0) - (muscleSetMap[a] || 0))

    // Radar uses muscles that have data (max 8 to avoid crowding)
    const radarMuscles = allMuscles.slice(0, 8)
    const radarData = radarMuscles.map(m => ({
        muscle: m,
        sets: muscleSetMap[m] || 0,
    }))

    const maxSets = Math.max(...Object.values(muscleSetMap), 1)
    const totalSets = Object.values(muscleSetMap).reduce((a, b) => a + b, 0)
    const activeMuscles = Object.entries(muscleSetMap).filter(([, s]) => s > 0)

    const pushSets = (muscleSetMap['Pectorales'] || 0) + Math.round((muscleSetMap['Hombros'] || 0) / 2)
    const pullSets = (muscleSetMap['Dorsales'] || 0) + (muscleSetMap['Espalda Alta'] || 0)
    const pushPullRatio = pullSets > 0 ? pushSets / pullSets : pushSets > 0 ? 99 : 1

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm font-display uppercase tracking-[0.2em] text-foreground">
                        Balance Muscular
                    </DialogTitle>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {totalSets} series totales · {activeMuscles.length} grupos activos
                    </p>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                    {totalSets === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            <p className="text-xs font-bold uppercase tracking-widest opacity-40">Sin ejercicios añadidos</p>
                        </div>
                    ) : (
                        <>
                            {/* Radar Chart */}
                            <div className="h-52 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={radarData} outerRadius="70%">
                                        <PolarGrid strokeOpacity={0.15} />
                                        <PolarAngleAxis
                                            dataKey="muscle"
                                            tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--muted-foreground)' }}
                                        />
                                        <PolarRadiusAxis tick={false} axisLine={false} />
                                        <Radar
                                            dataKey="sets"
                                            stroke="var(--theme-primary, #007AFF)"
                                            fill="var(--theme-primary, #007AFF)"
                                            fillOpacity={0.25}
                                            strokeWidth={2}
                                        />
                                        <Tooltip
                                            formatter={(value) => [`${value ?? 0} series`, '']}
                                            contentStyle={{
                                                background: 'var(--background)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 8,
                                                fontSize: 11,
                                                fontWeight: 700,
                                            }}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Bar list */}
                            <div className="space-y-2">
                                {allMuscles
                                    .map(m => {
                                        const sets = muscleSetMap[m] || 0
                                        const exCount = muscleExMap[m] || 0
                                        const pct = (sets / maxSets) * 100
                                        return (
                                            <div key={m} className="flex items-center gap-3">
                                                <div
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: getMuscleColor(m) }}
                                                />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-16 shrink-0 truncate">
                                                    {m}
                                                </span>
                                                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{
                                                            width: `${pct}%`,
                                                            backgroundColor: getMuscleColor(m),
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-foreground w-16 text-right shrink-0">
                                                    {sets > 0 ? `${sets}s · ${exCount}ej` : <span className="opacity-30">—</span>}
                                                </span>
                                            </div>
                                        )
                                    })}
                            </div>

                            {/* Push/Pull warning */}
                            {pushSets > 0 && pullSets > 0 && (
                                <div className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest ${
                                    pushPullRatio > 1.5
                                        ? 'border-orange-500/20 bg-orange-500/5 text-orange-500'
                                        : pushPullRatio < 0.65
                                            ? 'border-orange-500/20 bg-orange-500/5 text-orange-500'
                                            : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500'
                                }`}>
                                    {pushPullRatio > 1.5
                                        ? '⚠ Ratio empuje/jale desequilibrado — añade más trabajo de espalda'
                                        : pushPullRatio < 0.65
                                            ? '⚠ Ratio jale/empuje desequilibrado — añade más pecho y hombros'
                                            : `✓ Ratio empuje/jale equilibrado (${pushSets}s / ${pullSets}s)`
                                    }
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
