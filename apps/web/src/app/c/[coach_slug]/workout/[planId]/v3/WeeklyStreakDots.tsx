'use client'

import { cn } from '@/lib/utils'
import type { WeeklyStreak, WeeklyStreakDotState } from './weekly-streak'

/**
 * Ejecutor V3 (E4.4) — presentación de la RACHA SEMANAL: etiqueta + "N de M" + 7 puntos Lun→Dom.
 * Sin guilt: un día pendiente (pasado o futuro) se ve igual (`todo`), nunca como falta. El punto
 * `done` usa el acento del ejecutor (`--exec-brand`); `today` va en anillo; descanso/todo, tenues.
 * Compartida por la pantalla de Inicio (SessionStart) y la Final V3.
 */

const DOT_TITLE: Record<WeeklyStreakDotState, string> = {
    done: 'Completado',
    today: 'Hoy',
    rest: 'Descanso',
    todo: 'Pendiente',
}

/** Estilo inline por estado (self-contained, sin depender de CSS global nuevo). */
function dotStyle(state: WeeklyStreakDotState, isToday: boolean): React.CSSProperties {
    if (state === 'done') {
        return { background: 'var(--exec-brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--exec-brand) 20%, transparent)' }
    }
    if (state === 'today' || isToday) {
        return { background: 'transparent', boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--exec-brand) 70%, transparent)' }
    }
    // rest / todo: tenue, sin culpa.
    return { background: 'rgba(255,255,255,0.14)' }
}

export function WeeklyStreakDots({ streak, className }: { streak: WeeklyStreak; className?: string }) {
    if (streak.planned === 0) return null

    return (
        <div className={cn('flex items-center justify-center gap-2.5', className)}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-on-dark-muted">Racha semanal</span>
            {streak.label && (
                <span className="text-[13px] font-black tabular-nums text-on-dark">{streak.label}</span>
            )}
            <span className="flex items-center gap-1.5" role="img" aria-label={`Racha semanal: ${streak.label ?? ''}`}>
                {streak.days.map((d) => (
                    <span
                        key={d.dayOfWeek}
                        title={DOT_TITLE[d.state]}
                        className="h-2.5 w-2.5 rounded-full transition-transform"
                        style={dotStyle(d.state, d.isToday)}
                    />
                ))}
            </span>
        </div>
    )
}
