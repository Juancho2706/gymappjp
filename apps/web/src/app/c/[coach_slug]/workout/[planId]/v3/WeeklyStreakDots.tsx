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

/**
 * Estilo inline por estado (self-contained). Estilo del mockup `.a2-sd` (concepto-a-v2): dot 16px,
 * borde 2px; el `on` (done) rellena de marca con borde oscurecido + glow 3px de la marca al 20%.
 */
function dotStyle(state: WeeklyStreakDotState, isToday: boolean): React.CSSProperties {
    if (state === 'done') {
        return {
            background: 'var(--exec-brand)',
            border: '2px solid color-mix(in srgb, var(--exec-brand) 55%, #000)',
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--exec-brand) 20%, transparent)',
        }
    }
    if (state === 'today' || isToday) {
        return { background: '#26262f', border: '2px solid color-mix(in srgb, var(--exec-brand) 70%, transparent)' }
    }
    // rest / todo: apagado del mockup, sin culpa.
    return { background: '#26262f', border: '2px solid #33333f' }
}

export function WeeklyStreakDots({ streak, className }: { streak: WeeklyStreak; className?: string }) {
    if (streak.planned === 0) return null

    return (
        <div className={cn('flex items-center gap-2.5', className)}>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8f8f9c]">Racha semanal</span>
            {streak.label && (
                <span className="text-[13px] font-black tabular-nums text-on-dark">{streak.label}</span>
            )}
            <span className="ml-auto flex items-center gap-2" role="img" aria-label={`Racha semanal: ${streak.label ?? ''}`}>
                {streak.days.map((d) => (
                    <span
                        key={d.dayOfWeek}
                        title={DOT_TITLE[d.state]}
                        className="h-4 w-4 rounded-full transition-transform"
                        style={dotStyle(d.state, d.isToday)}
                    />
                ))}
            </span>
        </div>
    )
}
