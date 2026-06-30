'use client'

import type { ProgramPhase } from '../types'

interface ProgramPhasesBarProps {
    phases: ProgramPhase[]
}

/**
 * Barra de fases del builder (.dt-phasebar / .dt-phase): los segmentos se reparten por
 * peso de semanas (flex: weeks) y muestran el nombre + semanas SOBRE el color.
 */
export function ProgramPhasesBar({ phases }: ProgramPhasesBarProps) {
    if (!phases.length) return null

    return (
        <div className="px-4 md:px-6 pb-2.5 max-w-[2000px] mx-auto">
            <div className="flex gap-0.5" title="Fases del programa">
                {phases.map((p, i) => (
                    <div
                        key={`${p.name}-${i}`}
                        className="flex h-[22px] min-w-0 items-center overflow-hidden rounded-[5px] px-2"
                        style={{ flex: Math.max(1, p.weeks), backgroundColor: p.color || '#2680FF' }}
                        title={`${p.name} · ${p.weeks} sem`}
                    >
                        <span className="truncate text-[10.5px] font-extrabold text-white">
                            {p.name} · {p.weeks}sem
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
