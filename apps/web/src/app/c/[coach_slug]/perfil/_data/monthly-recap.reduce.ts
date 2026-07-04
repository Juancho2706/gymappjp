// Reducción PURA del resumen mensual (sin Supabase, testeable). Los RPC de agregación devuelven
// `day` como `YYYY-MM-DD` ya en zona America/Santiago, así que el filtro al mes calendario es un
// `startsWith(monthPrefix)` contra el prefijo `YYYY-MM` derivado también en Santiago
// (getSantiagoMonthPrefix). Cero dependencia de la TZ del host → borde del mes correcto en CI/prod.

export interface MonthlyRecapTotals {
    /** Días entrenados (con al menos una serie) dentro del mes. */
    sessions: number
    /** Volumen total del mes en kg (redondeado). */
    volumeKg: number
}

/** Fila de `get_client_workout_day_counts` (subconjunto usado acá). */
interface DayCountRow {
    day: string | null
    sets: number | null
}

/** Fila de `get_client_daily_tonnage` (subconjunto usado acá). */
interface TonnageRow {
    day: string | null
    tonnage: number | null
}

/**
 * Agrega sesiones y volumen del mes calendario. `monthPrefix` = "YYYY-MM" (en Santiago).
 * - Sesiones: días del mes con `sets > 0`.
 * - Volumen: suma de `tonnage` de los días del mes.
 */
export function reduceMonthlyRecap(
    dayCounts: ReadonlyArray<DayCountRow>,
    tonnage: ReadonlyArray<TonnageRow>,
    monthPrefix: string
): MonthlyRecapTotals {
    const inMonth = (d: string | null | undefined): boolean => typeof d === 'string' && d.startsWith(monthPrefix)

    const sessions = dayCounts.filter((r) => inMonth(r.day) && Number(r.sets ?? 0) > 0).length

    const volumeKg = Math.round(
        tonnage.filter((r) => inMonth(r.day)).reduce((sum, r) => sum + (Number(r.tonnage ?? 0) || 0), 0)
    )

    return { sessions, volumeKg }
}
