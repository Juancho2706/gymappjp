'use client'

import { Check } from 'lucide-react'

export interface MomentumDay {
    label: string
    isToday: boolean
    hasWorkout: boolean
    isCompleted: boolean
}

/** Tira semanal del card "Momentum" (diseño eva-app): L M X J V S D, hoy relleno, hecho = check. */
export function MomentumWeekStrip({ days }: { days: MomentumDay[] }) {
    return (
        <div className="flex gap-1.5">
            {days.map((d, i) => {
                const planned = d.hasWorkout && !d.isCompleted && !d.isToday
                return (
                    <div
                        key={i}
                        className={[
                            'flex h-[54px] flex-1 flex-col items-center justify-center gap-1.5 rounded-control',
                            d.isToday
                                ? 'bg-[var(--cta-fill)]'
                                : d.isCompleted
                                  ? 'border border-subtle bg-surface-card'
                                  : 'border border-subtle bg-surface-sunken',
                        ].join(' ')}
                    >
                        <span
                            className={`font-display text-xs font-extrabold ${d.isToday ? 'text-on-sport' : 'text-subtle'}`}
                        >
                            {d.label}
                        </span>
                        <span className="flex h-4 w-4 items-center justify-center">
                            {d.isCompleted ? (
                                <Check className="h-3.5 w-3.5 text-[var(--success-500)]" />
                            ) : d.isToday ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            ) : planned ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-sport-500/50" />
                            ) : null}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
