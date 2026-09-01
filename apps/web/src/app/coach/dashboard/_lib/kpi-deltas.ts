import type { KpiDelta, KpiDeltas } from '../_data/types'

/**
 * Deltas reales de los KPI del bento del coach (fases 1 y 2).
 *
 * CRITERIO. Casi todo se calcula con datos que la cadena del dashboard YA cargó
 * (`areaData`, `adherenceHistory4w`, `signupDates`); lo único que se suma en fase 2 es la fila de
 * `coach_kpi_snapshots` de hace 7 días, que viaja en el mismo `Promise.all`. Este módulo es puro
 * — sin Next, sin Supabase, sin `Date.now()` implícito — para poder testearlo sin DB y para que
 * web y RN reciban exactamente el mismo número por el mismo endpoint.
 *
 * HONESTIDAD DEL COPY.
 * - «Alumnos»: CON la fila T−7 es el saldo NETO (`totalClients − snapshot.active_clients`) y el
 *   copy dice «vs. hace 7 días», así que una caída se puede leer. SIN fila cae al delta de fase 1:
 *   ALTAS brutas («+N esta semana»), porque `clients` no tiene `archived_at` ni `deleted_at` y las
 *   bajas serían invisibles. Son dos copys distintos a propósito: el lector sabe cuál está viendo.
 * - «Adherencia»: las 4 ventanas de `adherenceHistory4w` usan el `totalPlannedSets` del programa
 *   ACTUAL del alumno, no el de cada semana. Un cambio de programa distorsiona la semana previa.
 *   Es el mismo sesgo que ya tiene el número principal (`kpi.avgAdherence`), aceptado en fase 1.
 *   La unidad es «pts» (puntos porcentuales) para no confundirla con el «%» del valor principal.
 * - «En riesgo»: hoy contra la fila de hace 7 días. `null` mientras esa fila no exista (coach
 *   nuevo, o cron sin historial todavía): el tile cae a su caption y no inventa una tendencia.
 *
 * POR QUÉ EL T−7 NO SE RECONSTRUYE. Reevaluar `calculateAttentionScore` con el mundo de hace una
 * semana es imposible con los datos de hoy: `workout_programs.is_active` es un booleano mutable
 * sin historial, los `check_ins` del pulse solo llegan hasta `now−35d` (el flag «sin check-in en
 * 1 mes» necesitaría `now−37d`) y los logs de nutrición hasta `now−7d`. De ahí el snapshot diario.
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

/** Lo único que los deltas necesitan de la fila `coach_kpi_snapshots` de hace 7 días. */
export interface KpiSnapshot7d {
    risk_count: number
    active_clients: number
}

/**
 * «En riesgo»: hoy contra la fila de `coach_kpi_snapshots` de hace 7 días (7C fase 2).
 *
 * `null` cuando esa fila no existe — coach dado de alta hace menos de una semana, o cron sin
 * historial suficiente todavía. En ese caso el tile conserva su caption fija («requieren
 * revisión»), que describe el número y no una tendencia inventada.
 *
 * El tono va AL REVÉS del resto del bento: más alumnos en riesgo es peor, así que subir es
 * `negative` y bajar es `positive`. La UI solo mapea tono → color; el criterio vive acá.
 */
export function riskDelta(riskCount: number, snapshot7d: KpiSnapshot7d | null): KpiDelta {
    if (!snapshot7d) return null

    const value = riskCount - snapshot7d.risk_count

    if (value === 0) return { value: 0, text: 'igual que hace 7 días', tone: 'neutral' }
    return {
        value,
        text: `${formatSigned(value)} vs. hace 7 días`,
        tone: value > 0 ? 'negative' : 'positive',
    }
}

/**
 * «Alumnos» en saldo NETO: total de hoy contra `active_clients` de la fila de hace 7 días.
 *
 * Es lo que fase 1 no podía decir: con altas brutas, un coach que sumó 1 y perdió 3 leía
 * «+1 esta semana». Acá lee «−2 vs. hace 7 días». Devuelve `null` sin fila; el llamador cae al
 * delta de altas, que tiene copy propio para que las dos lecturas no se confundan.
 */
export function clientsNetDelta(totalClients: number, snapshot7d: KpiSnapshot7d | null): KpiDelta {
    if (!snapshot7d) return null

    const value = totalClients - snapshot7d.active_clients

    if (value === 0) return { value: 0, text: 'igual que hace 7 días', tone: 'neutral' }
    return {
        value,
        text: `${formatSigned(value)} vs. hace 7 días`,
        tone: value > 0 ? 'positive' : 'negative',
    }
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
    /** Alumnos en riesgo AHORA (`splitRiskClients(pulse).riskCount`). */
    riskCount: number
    /** Cartera de HOY (`countCoachClients`), para el saldo neto contra la fila T−7. */
    totalClients: number
    /** Fila `coach_kpi_snapshots` de hace 7 días, o `null` si todavía no existe. */
    snapshot7d: KpiSnapshot7d | null
}

/**
 * Arma los cuatro deltas de una. Punto de entrada único para las dos funciones V2 del dashboard
 * (`getCoachDashboardDataV2` y `getCoachDashboardDataV2WithClient`), para que web y RN nunca
 * puedan divergir en el criterio ni en el copy.
 *
 * `clients` prefiere el saldo NETO contra la fila T−7 y solo cae a las altas brutas de fase 1
 * cuando esa fila no existe: el copy distinto («vs. hace 7 días» / «esta semana») es lo que hace
 * honesta la caída, porque las altas nunca pueden ser negativas.
 */
export function buildKpiDeltas(input: KpiDeltasInput): KpiDeltas {
    return {
        clients: clientsNetDelta(input.totalClients, input.snapshot7d) ?? clientsDelta(input.signupDates, input.nowIso),
        risk: riskDelta(input.riskCount, input.snapshot7d),
        adherence: adherenceDelta(input.adherenceStats),
        sessionsToday: sessionsTodayDelta(input.areaData, input.todayKey, input.yesterdayKey),
    }
}
