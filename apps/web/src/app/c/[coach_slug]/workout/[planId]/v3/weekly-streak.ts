/**
 * Ejecutor V3 (E4.4) — RACHA SEMANAL, cálculo PURO y compartible.
 *
 * Opera sobre el shape que ya produce `deriveWeekWorkoutStatus` (dashboard): cada día de la semana
 * actual (Lun→Dom) con su estado. La racha es SEMANAL, nunca diaria, y sin guilt-copy: un día pasado
 * sin completar (`pending`) NO se pinta como fallo — se muestra igual que un día futuro pendiente
 * (`todo`), de modo que el mensaje siempre es "vas 3 de 4", jamás "fallaste el martes".
 *
 * N (`done`)     = sesiones hechas esta semana (días con estado `done`, incluye recuperaciones).
 * M (`planned`)  = días con plan esta semana (todo lo que no sea `rest`).
 * `label`        = "N de M" para el copy; `null` cuando no hay plan (M = 0) → la UI omite la pieza.
 *
 * Puro y sin dependencias de React/DOM — se testea en aislamiento y lo consumen tanto la pantalla de
 * Inicio (SessionStart) como la Final V3.
 */

/** Estado de un día tal como lo emite `deriveWeekWorkoutStatus`. */
export type WeekDayStatus = 'rest' | 'done' | 'today' | 'pending' | 'upcoming'

/** Entrada mínima por día (subconjunto estructural de `WeekDay`). */
export interface WeekStatusDaySource {
    /** 1 = Lunes … 7 = Domingo (convención DB). */
    dayOfWeek: number
    status: WeekDayStatus
    isToday: boolean
}

/** Estado visual del punto (dot). `todo` = pendiente sin culpa (pasado o futuro por igual). */
export type WeeklyStreakDotState = 'done' | 'today' | 'rest' | 'todo'

export interface WeeklyStreakDay {
    dayOfWeek: number
    state: WeeklyStreakDotState
    isToday: boolean
}

export interface WeeklyStreak {
    /** 7 días ordenados Lun→Dom con su estado de punto. */
    days: WeeklyStreakDay[]
    /** Sesiones completadas esta semana (N). */
    done: number
    /** Días con plan esta semana (M). */
    planned: number
    /** "N de M esta semana" ya resuelto; `null` si no hay plan (M = 0). */
    label: string | null
}

/** Estado de dot sin culpa: `pending`/`upcoming` colapsan a `todo` (mismo visual, cero guilt). */
function dotStateFor(status: WeekDayStatus): WeeklyStreakDotState {
    switch (status) {
        case 'done':
            return 'done'
        case 'today':
            return 'today'
        case 'rest':
            return 'rest'
        default:
            return 'todo'
    }
}

/**
 * Deriva la racha SEMANAL desde los días de la semana actual. No muta la entrada; ordena Lun→Dom
 * de forma defensiva. Sin días con plan ⇒ `label` null (la UI omite la racha por completo).
 */
export function computeWeeklyStreak(source: readonly WeekStatusDaySource[]): WeeklyStreak {
    const days: WeeklyStreakDay[] = [...source]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map((d) => ({ dayOfWeek: d.dayOfWeek, state: dotStateFor(d.status), isToday: d.isToday }))

    const done = source.filter((d) => d.status === 'done').length
    const planned = source.filter((d) => d.status !== 'rest').length
    const label = planned > 0 ? `${done} de ${planned}` : null

    return { days, done, planned, label }
}
