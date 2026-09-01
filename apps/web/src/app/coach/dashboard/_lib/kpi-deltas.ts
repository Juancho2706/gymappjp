import type { KpiDelta, KpiDeltas } from '../_data/types'

/**
 * Deltas reales de los KPI del bento del coach (fase 1).
 *
 * CRITERIO. Todo se calcula con datos que la cadena del dashboard YA cargó
 * (`areaData`, `adherenceHistory4w`, `signupDates`): cero queries nuevas por render. Este módulo
 * es puro — sin Next, sin Supabase, sin `Date.now()` implícito — para poder testearlo sin DB y
 * para que web y RN reciban exactamente el mismo número por el mismo endpoint.
 *
 * HONESTIDAD DEL COPY.
 * - «Alumnos»: es un delta de ALTAS, no de saldo neto. `clients` no tiene `archived_at` ni
 *   `deleted_at`, así que las bajas de la semana son invisibles; el texto dice «+N esta semana»
 *   y nunca «N más» ni «el total subió N».
 * - «Adherencia»: las 4 ventanas de `adherenceHistory4w` usan el `totalPlannedSets` del programa
 *   ACTUAL del alumno, no el de cada semana. Un cambio de programa distorsiona la semana previa.
 *   Es el mismo sesgo que ya tiene el número principal (`kpi.avgAdherence`), aceptado en fase 1.
 *   La unidad es «pts» (puntos porcentuales) para no confundirla con el «%» del valor principal.
 * - «En riesgo»: sin delta en fase 1 (ver `riskDelta`).
 *
 * FORMA. El `text` sale del servidor y la UI lo pinta tal cual (web y RN); el `tone` ya trae la
 * dirección «buena» del KPI. Signo «−» tipográfico (U+2212), no guion. Sin flechas.
 */

/** Signo menos tipográfico (U+2212). El guion ASCII se lee como separador, no como negativo. */
const MINUS_SIGN = '−'

/** `+3` / `−2`. Solo para valores distintos de cero (el caso 0 tiene copy propio por KPI). */
function formatSigned(value: number): string {
    return value > 0 ? `+${value}` : `${MINUS_SIGN}${Math.abs(value)}`
}

/**
 * «Sesiones hoy» vs. ayer, leyendo `areaData` (30 días de sesiones/día, dedup por alumno+día,
 * agrupadas en zona Santiago). `areaData` FILTRA los días con cero sesiones, así que un día
 * ausente vale 0: es la lectura correcta, no un dato faltante.
 *
 * @param areaData Serie del AreaChart; las claves son `DD/MM` en zona Santiago.
 * @param todayKey Clave `DD/MM` de hoy, calculada con el mismo formateador que armó `areaData`.
 * @param yesterdayKey Clave `DD/MM` de ayer.
 */
export function sessionsTodayDelta(
    areaData: { name: string; sesiones?: number | null }[],
    todayKey: string,
    yesterdayKey: string
): KpiDelta {
    const today = areaData.find((point) => point.name === todayKey)?.sesiones ?? 0
    const yesterday = areaData.find((point) => point.name === yesterdayKey)?.sesiones ?? 0
    const value = today - yesterday

    if (value === 0) return { value: 0, text: 'igual que ayer', tone: 'neutral' }
    return {
        value,
        text: `${formatSigned(value)} vs. ayer`,
        tone: value > 0 ? 'positive' : 'negative',
    }
}

/**
 * «Adherencia» de la última semana vs. la previa, en puntos porcentuales.
 *
 * `adherenceHistory4w[3]` es la ventana de los últimos 7 días (idéntica al `percentage` que
 * alimenta `kpi.avgAdherence`) y `[2]` la de 7-14 días. Se promedia y se redondea cada semana por
 * separado, con el MISMO criterio que `avgAdherence` (`Math.round` del promedio), para que el
 * delta cierre con el número que lo acompaña.
 *
 * Devuelve `null` cuando no hay alumnos o cuando ninguna fila trae historia: sin base de
 * comparación no hay delta honesto que mostrar.
 */
export function adherenceDelta(stats: { adherenceHistory4w?: number[] | null }[]): KpiDelta {
    if (stats.length === 0) return null

    const hasHistory = stats.some((stat) => Array.isArray(stat.adherenceHistory4w) && stat.adherenceHistory4w.length > 0)
    if (!hasHistory) return null

    const weekAverage = (index: number) =>
        Math.round(stats.reduce((acc, stat) => acc + (stat.adherenceHistory4w?.[index] ?? 0), 0) / stats.length)

    const value = weekAverage(3) - weekAverage(2)

    if (value === 0) return { value: 0, text: 'igual que la semana previa', tone: 'neutral' }
    return {
        value,
        text: `${formatSigned(value)} pts vs. semana previa`,
        tone: value > 0 ? 'positive' : 'negative',
    }
}

/**
 * «Alumnos»: altas de los últimos 7 días, contadas sobre la lista de `created_at` que la ventana
 * de altas del BarChart ya trajo (5 meses hacia atrás, así que la semana siempre está adentro).
 *
 * Nunca es negativo: son altas brutas. El copy jamás afirma que el total subió (ver cabecera).
 *
 * @param signupDates Filas `{ created_at }` de `findCoachClientSignupDates`, o los ISO pelados.
 * @param nowIso Instante de referencia en ISO; se pasa explícito para que el helper sea puro.
 */
export function clientsDelta(signupDates: { created_at: string }[] | string[], nowIso: string): KpiDelta {
    const reference = new Date(nowIso).getTime()
    const cutoff = Number.isNaN(reference) ? Number.NaN : reference - 7 * 24 * 60 * 60 * 1000

    let value = 0
    if (!Number.isNaN(cutoff)) {
        for (const entry of signupDates) {
            const raw = typeof entry === 'string' ? entry : entry?.created_at
            if (!raw) continue
            const createdAt = new Date(raw).getTime()
            if (Number.isNaN(createdAt)) continue
            if (createdAt >= cutoff) value += 1
        }
    }

    if (value === 0) return { value: 0, text: 'sin altas esta semana', tone: 'neutral' }
    return { value, text: `+${value} esta semana`, tone: 'positive' }
}

/**
 * «En riesgo»: SIN delta en fase 1, siempre `null`.
 *
 * Saber cuántos alumnos estaban en riesgo hace 7 días exige reevaluar `calculateAttentionScore`
 * con el estado del mundo de entonces, y tres de sus entradas son irreconstruibles hoy:
 * `workout_programs.is_active` es un booleano mutable sin historial, los `check_ins` del pulse
 * solo llegan hasta `now−35d` (el flag de «sin check-in en 1 mes» necesitaría `now−37d`) y los
 * logs de nutrición solo hasta `now−7d`. Requiere un snapshot diario por coach: fase 2 del
 * mini-plan 7C. Hasta entonces el tile conserva su caption fija («requieren revisión»), que no
 * es un delta y no miente.
 */
export function riskDelta(): KpiDelta {
    return null
}

export interface KpiDeltasInput {
    /** Serie del AreaChart con claves `DD/MM` en zona Santiago. */
    areaData: { name: string; sesiones?: number | null }[]
    /** Clave `DD/MM` de hoy, del mismo formateador Santiago que armó `areaData`. */
    todayKey: string
    /** Clave `DD/MM` de ayer. */
    yesterdayKey: string
    /** Filas del pulse mapeadas, con `adherenceHistory4w`. */
    adherenceStats: { adherenceHistory4w?: number[] | null }[]
    /** Altas crudas (`created_at`) dentro de la ventana ya cargada. */
    signupDates: { created_at: string }[] | string[]
    /** Instante de referencia en ISO. */
    nowIso: string
}

/**
 * Arma los cuatro deltas de una. Punto de entrada único para las dos funciones V2 del dashboard
 * (`getCoachDashboardDataV2` y `getCoachDashboardDataV2WithClient`), para que web y RN nunca
 * puedan divergir en el criterio ni en el copy.
 */
export function buildKpiDeltas(input: KpiDeltasInput): KpiDeltas {
    return {
        clients: clientsDelta(input.signupDates, input.nowIso),
        risk: riskDelta(),
        adherence: adherenceDelta(input.adherenceStats),
        sessionsToday: sessionsTodayDelta(input.areaData, input.todayKey, input.yesterdayKey),
    }
}
