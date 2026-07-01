'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsDesktopMd } from './useIsDesktopMd'
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip
} from 'recharts'
import { getMuscleColor } from '../muscle-colors'
import { effectiveExerciseType } from '@/lib/workout-exercise-type'
import type { DayState } from '../types'

interface MuscleBalancePanelProps {
    open: boolean
    onClose: () => void
    days: DayState[]
}

/**
 * Acumula series/ejercicios por grupo muscular contando SOLO bloques con tipo
 * efectivo 'strength' (F4.5 specs/movida-entrenamiento): cardio/movilidad/roller
 * no inflan el volumen muscular; legacy sin tipo resuelve strength y sí cuenta.
 * Exportada solo para tests.
 */
export function buildMuscleBalance(days: DayState[]): {
    muscleSetMap: Record<string, number>
    muscleExMap: Record<string, number>
} {
    const muscleSetMap: Record<string, number> = {}
    const muscleExMap: Record<string, number> = {}

    for (const day of days) {
        if (day.is_rest) continue
        for (const block of day.blocks) {
            if (effectiveExerciseType(block, { exercise_type: block.exercise_type }) !== 'strength') continue
            const m = block.muscle_group || 'Otro'
            muscleSetMap[m] = (muscleSetMap[m] || 0) + (block.sets || 0)
            muscleExMap[m] = (muscleExMap[m] || 0) + 1
        }
    }

    return { muscleSetMap, muscleExMap }
}

export function MuscleBalancePanel({ open, onClose, days }: MuscleBalancePanelProps) {
    const { muscleSetMap, muscleExMap } = buildMuscleBalance(days)

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

    const isDesktop = useIsDesktopMd()

    const body = (
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
                                <div className={`p-3 rounded-card border text-xs font-semibold ${
                                    pushPullRatio > 1.5 || pushPullRatio < 0.65
                                        ? 'border-[var(--warning-500)]/25 bg-[var(--warning-100)] text-[var(--warning-600)]'
                                        : 'border-[var(--success-500)]/25 bg-[var(--success-100)] text-[var(--success-600)]'
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
    )

    if (!isDesktop) {
        return (
            <Sheet open={open} onOpenChange={onClose}>
                <SheetContent
                    side="bottom"
                    showCloseButton
                    className="max-h-[88dvh] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
                >
                    <div className="flex max-h-[88dvh] flex-col overflow-y-auto overscroll-contain px-5 pb-4 pt-3">
                        <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                        <SheetHeader className="border-0 bg-transparent p-0">
                            <SheetTitle className="sr-only">Balance muscular</SheetTitle>
                        </SheetHeader>
                        <h2 className="font-display text-lg font-extrabold tracking-[-0.02em] text-strong">Balance muscular</h2>
                        <p className="text-[13px] text-muted">
                            {totalSets} series totales · {activeMuscles.length} grupos activos
                        </p>
                        {body}
                    </div>
                </SheetContent>
            </Sheet>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="font-display text-[17px] font-extrabold normal-case tracking-[-0.02em] text-foreground">
                        Balance muscular
                    </DialogTitle>
                    <p className="text-[13px] text-muted-foreground">
                        {totalSets} series totales · {activeMuscles.length} grupos activos
                    </p>
                </DialogHeader>
                {body}
            </DialogContent>
        </Dialog>
    )
}
