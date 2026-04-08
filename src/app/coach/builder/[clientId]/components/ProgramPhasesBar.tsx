'use client'

import type { ProgramPhase } from '../types'

interface ProgramPhasesBarProps {
    phases: ProgramPhase[]
    weeksToRepeat: number
}

export function ProgramPhasesBar({ phases, weeksToRepeat }: ProgramPhasesBarProps) {
    if (!phases.length) return null
    const total = phases.reduce((s, p) => s + Math.max(1, p.weeks), 0) || 1

    return (
        <div className="px-4 md:px-6 pb-2 max-w-[2000px] mx-auto">
            <div className="flex h-2 rounded-full overflow-hidden bg-muted border border-border/60 shadow-inner">
                {phases.map((p, i) => {
                    const w = (Math.max(1, p.weeks) / total) * 100
                    return (
                        <div
                            key={`${p.name}-${i}`}
                            className="h-full min-w-[4px] transition-all"
                            style={{ width: `${w}%`, backgroundColor: p.color || '#6366F1' }}
                            title={`${p.name}: ${p.weeks} sem.`}
                        />
                    )
                })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center md:justify-start">
                {phases.map((p, i) => (
                    <div key={`${p.name}-lbl-${i}`} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6366F1' }} />
                        <span className="text-foreground/90">{p.name}</span>
                        <span className="opacity-50">({p.weeks}s)</span>
                    </div>
                ))}
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 ml-auto">
                    Programa: {weeksToRepeat} sem.
                </span>
            </div>
        </div>
    )
}
