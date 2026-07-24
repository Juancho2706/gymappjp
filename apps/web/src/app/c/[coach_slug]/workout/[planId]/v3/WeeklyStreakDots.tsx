'use client'

import { cn } from '@/lib/utils'
import type { WeeklyStreak, WeeklyStreakDotState } from './weekly-streak'

/**
 * Ejecutor V3 (E4.4) — presentación de la RACHA SEMANAL: etiqueta + "N de M" + 7 puntos Lun→Dom.
 * Sin guilt: un día ASIGNADO sin hacer (pasado o futuro) se ve igual (`todo`), nunca como falta.
 *
 * QA6 (decisión CEO 2026-07-22): la racha cuenta DÍAS ASIGNADOS COMPLETADOS. Un día SIN asignación
 * (`rest` — sin plan ni descanso explícito; ambos persisten igual: sin fila de `workout_plan` para ese
 * día) es NEUTRO: no cuenta al denominador (ya lo excluye `computeWeeklyStreak`) NI corta la cadena, y
 * se pinta DISTINTO — punto pequeño y tenue SIN borde de "fallo" — para que la fila Lun→Dom lea a los
 * días entrenados como una cadena que SALTA los neutros, en vez de un `todo` bordeado que parecía un
 * eslabón roto. `done` usa el acento (`--exec-brand`); `today` va en anillo; `todo` (asignado sin hacer)
 * conserva el punto del track con borde tenue. Compartida por Inicio (SessionStart) y Final V3.
 */

const DOT_TITLE: Record<WeeklyStreakDotState, string> = {
    done: 'Completado',
    today: 'Hoy',
    rest: 'Sin asignación',
    todo: 'Pendiente',
}

/**
 * Estilo inline por estado (self-contained). Estilo del mockup `.a2-sd` (concepto-a-v2): dot 16px,
 * borde 2px; el `on` (done) rellena de marca con borde oscurecido + glow 3px de la marca al 20%.
 * `rest` rompe con el mockup a propósito (QA6): día SIN asignación = punto ~7px, tenue, SIN borde.
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
    if (state === 'rest') {
        // Día SIN asignación (o descanso explícito): NEUTRO — punto pequeño y tenue, sin borde de
        // "fallo". Recede visualmente para que la cadena de días asignados salte el hueco sin romperse.
        return { background: '#33333f', border: 'none', transform: 'scale(0.45)', opacity: 0.7 }
    }
    // todo: día ASIGNADO sin hacer (pasado o futuro), sin culpa — punto del track con borde tenue.
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
