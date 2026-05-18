'use client'

export interface SharedProgramPhase {
    name: string
    weeks: number
    color?: string
}

interface ProgramPhasesBarProps {
    phases: SharedProgramPhase[]
    compact?: boolean
}

export function ProgramPhasesBar({ phases, compact = false }: ProgramPhasesBarProps) {
    if (!phases?.length) return null
    const total = phases.reduce((s, p) => s + Math.max(1, p.weeks), 0) || 1

    return (
        <div className={compact ? 'w-full' : 'px-4 md:px-6 pb-2 max-w-[2000px] mx-auto'}>
            <div className={`flex ${compact ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden bg-muted border border-border/60 shadow-inner`}>
                {phases.map((p, i) => {
                    const width = (Math.max(1, p.weeks) / total) * 100
                    return (
                        <div
                            key={`${p.name}-${i}`}
                            className="h-full min-w-[4px]"
                            style={{ width: `${width}%`, backgroundColor: p.color || '#6366F1' }}
                            title={`${p.name}: ${p.weeks} sem.`}
                        />
                    )
                })}
            </div>
        </div>
    )
}
