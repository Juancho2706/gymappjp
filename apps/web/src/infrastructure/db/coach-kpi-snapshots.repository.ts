import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * `coach_kpi_snapshots` — la foto diaria de los KPI del panel del coach (7C fase 2).
 *
 * Una fila por `(coach_id, day)` con el estado al INICIO del día calendario Santiago. Existe
 * porque el riesgo de hace 7 días es IRRECONSTRUIBLE a posteriori: `workout_programs.is_active`
 * es un booleano mutable sin historial, los check-ins del pulse solo llegan hasta `now−35d` y los
 * logs de nutrición hasta `now−7d`. Sin este registro no hay delta honesto para «En riesgo».
 *
 * RLS: el coach solo SELECTea sus propias filas (`auth.uid() = coach_id`); escribe únicamente
 * `service_role` (el cron). Por eso el upsert de acá siempre viaja con el cliente admin.
 */

export type CoachKpiSnapshotRow = Database['public']['Tables']['coach_kpi_snapshots']['Row']
export type CoachKpiSnapshotInsert = Database['public']['Tables']['coach_kpi_snapshots']['Insert']

/** Lo único que el dashboard lee de la fila T−7: los números, sin `created_at` ni `coach_id`. */
export type CoachKpiSnapshotComparable = Pick<
    CoachKpiSnapshotRow,
    'day' | 'risk_count' | 'active_clients' | 'avg_adherence' | 'sessions_7d'
>

/**
 * Un solo `console.warn` por proceso: el dashboard del coach llama a esto en CADA render, y una
 * tabla caída no puede convertirse en una línea de log por request.
 */
let warnedSnapshotRead = false

/**
 * Fila del coach para un día calendario exacto (`YYYY-MM-DD`, zona Santiago), o `null`.
 *
 * FAIL-SOFT deliberado: ante `error` devuelve `null` en vez de propagar. Un delta ausente degrada
 * el tile a su caption; una excepción tiraría el dashboard entero por un adorno.
 */
export async function findCoachKpiSnapshotForDay(
    db: DB,
    coachId: string,
    dayYmd: string
): Promise<CoachKpiSnapshotComparable | null> {
    const { data, error } = await db
        .from('coach_kpi_snapshots')
        .select('day, risk_count, active_clients, avg_adherence, sessions_7d')
        .eq('coach_id', coachId)
        .eq('day', dayYmd)
        .maybeSingle()

    if (error) {
        if (!warnedSnapshotRead) {
            warnedSnapshotRead = true
            console.warn(`[coach_kpi_snapshots] lectura fallida (code=${error.code ?? 'sin_code'}); el delta queda en null.`)
        }
        return null
    }

    return (data as CoachKpiSnapshotComparable | null) ?? null
}

/**
 * Upsert por `(coach_id, day)`: la corrida del cron es idempotente y se puede repetir el mismo día
 * (por ejemplo para SEMBRAR la fila de hoy tras el deploy) sin duplicar ni acumular.
 *
 * Devuelve el error como texto en vez de lanzarlo: el cron procesa a todos los coaches y una
 * escritura fallida se reporta en la respuesta, no aborta la corrida.
 */
export async function upsertCoachKpiSnapshots(
    db: DB,
    rows: CoachKpiSnapshotInsert[]
): Promise<{ error: string | null }> {
    if (rows.length === 0) return { error: null }

    const { error } = await db.from('coach_kpi_snapshots').upsert(rows, { onConflict: 'coach_id,day' })

    return { error: error ? error.message : null }
}
