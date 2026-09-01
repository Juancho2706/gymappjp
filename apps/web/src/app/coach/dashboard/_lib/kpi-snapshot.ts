/**
 * Helpers puros del snapshot diario de KPI del coach (7C fase 2).
 *
 * Este módulo NO toca Next, Supabase ni `Date.now()` implícito: recibe el instante y los datos ya
 * cargados. Vive acá, en `_lib`, para que la fila que ESCRIBE el cron y el número que LEE el
 * dashboard salgan de la misma aritmética — si divergen, el delta miente sin que nadie lo note.
 */

/** Ventana del delta: la fila que se compara es la de `hoy − 7 días` calendario. */
export const KPI_SNAPSHOT_LOOKBACK_DAYS = 7

/**
 * Único formateador de fecha calendario del snapshot. El runtime de Vercel es UTC; sin la zona
 * Santiago las corridas nocturnas caen al día siguiente y la fila queda con la etiqueta cambiada.
 * Es el MISMO `Intl.DateTimeFormat` que usa `ymdSantiago` en `dashboard.queries`.
 */
const santiagoYmdFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

/** `YYYY-MM-DD` del instante dado, en día calendario de Santiago. */
export function santiagoYmd(date: Date): string {
    return santiagoYmdFmt.format(date)
}

/**
 * Resta días de CALENDARIO a un `YYYY-MM-DD`, sin husos ni horario de verano de por medio.
 *
 * Se hace con `Date.UTC` a propósito: la clave de la tabla es una fecha, no un instante, así que
 * restar milisegundos sobre una fecha local podría saltarse un día en el cambio de hora chileno.
 * Cruza mes y año (`2026-03-03 − 7 = 2026-02-24`, `2027-01-03 − 7 = 2026-12-27`).
 */
export function ymdMinusDays(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number)
    const shifted = new Date(Date.UTC(y, m - 1, d - days))
    const yy = shifted.getUTCFullYear()
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(shifted.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
}

/**
 * Sesiones únicas: una sesión = un alumno en un día. Mismo criterio de dedup que el AreaChart del
 * dashboard (`${client_id}|${dayKey}`), para que `sessions_7d` sea comparable con lo que el coach
 * ve en el gráfico y no un conteo de filas de `workout_logs`.
 *
 * @param dayKeyOf Formateador de día; se inyecta para mantener el módulo puro y testeable.
 */
export function countUniqueClientDays(
    logs: { client_id: string | null; logged_at: string }[],
    dayKeyOf: (d: Date) => string
): number {
    const seen = new Set<string>()
    for (const log of logs) {
        seen.add(`${log.client_id ?? ''}|${dayKeyOf(new Date(log.logged_at))}`)
    }
    return seen.size
}

/**
 * Promedio de adherencia redondeado, con la MISMA expresión que `avgAdherence` del dashboard
 * (`Math.round` del promedio, 0 sin filas). Compartirla es el punto: el snapshot y el KPI vivo no
 * pueden redondear distinto o el delta aparecería con ±1 fantasma.
 */
export function averageAdherence(stats: { percentage: number }[]): number {
    if (stats.length === 0) return 0
    return Math.round(stats.reduce((acc, s) => acc + s.percentage, 0) / stats.length)
}
