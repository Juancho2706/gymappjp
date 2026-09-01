import { countCoachClients, upsertCoachKpiSnapshots, type CoachKpiSnapshotInsert } from '@/infrastructure/db'
import type { DbClient } from '@/infrastructure/db/interfaces'
import { DashboardService, mapDirectoryPulseToAdherenceStats } from '@/services/dashboard.service'
import { averageAdherence, countUniqueClientDays, santiagoYmd } from '../_lib/kpi-snapshot'
import { applyJoinedClientOwnerScope, resolveCoachDashboardScope, splitRiskClients } from './dashboard.queries'

/**
 * Escritura de la foto diaria de KPI del coach (`coach_kpi_snapshots`, 7C fase 2).
 *
 * POR QUÉ EXISTE. El delta de «En riesgo» no se puede reconstruir a posteriori: el riesgo se
 * evalúa contra `workout_programs.is_active` (booleano mutable, sin historial), check-ins que el
 * pulse solo lee hasta `now−35d` y nutrición hasta `now−7d`. La única forma honesta de decir
 * «3 más que hace una semana» es haberlo anotado esa semana.
 *
 * CRITERIO. La foto se toma por el MISMO camino que ve el coach: workspace preferido
 * (`resolveCoachDashboardScope`), pulse del `DashboardService`, `countCoachClients` y el mismo
 * scope de `workout_logs` que el dashboard. Si la foto usara otro scope, el delta compararía dos
 * carteras distintas.
 *
 * Lo llama el cron `/api/cron/coach-kpi-snapshot` con el cliente service-role (la tabla solo deja
 * escribir a `service_role`).
 */

/** Ventana de `sessions_7d`: sesiones únicas (alumno + día) de los últimos 7 días. */
const SESSIONS_WINDOW_DAYS = 7

/** Coaches por lote. Cada uno son ~3 consultas, así que el lote acota la concurrencia contra la DB. */
const DEFAULT_CONCURRENCY = 5

/**
 * Fila del snapshot para UN coach, calculada con el estado actual del mundo.
 *
 * `day` es el día calendario Santiago de `now`; el cron corre de madrugada, así que la fila
 * describe el estado al INICIO de ese día.
 */
export async function computeCoachKpiSnapshot(
    db: DbClient,
    coachId: string,
    now: Date
): Promise<CoachKpiSnapshotInsert> {
    const scope = await resolveCoachDashboardScope(db, coachId)
    const sevenDaysAgoIso = new Date(now.getTime() - SESSIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [pulse, clientsCount, logsRes] = await Promise.all([
        new DashboardService(db).getDirectoryPulse(coachId, scope),
        countCoachClients(db, coachId, scope.orgId, scope.teamId),
        applyJoinedClientOwnerScope(
            db
                .from('workout_logs')
                .select('logged_at, client_id, clients!inner(coach_id, org_id, team_id, is_archived)')
                .eq('clients.is_archived', false),
            coachId,
            scope
        ).gte('logged_at', sevenDaysAgoIso),
    ])

    const logs = (logsRes.data ?? []) as { client_id: string | null; logged_at: string }[]

    return {
        coach_id: coachId,
        day: santiagoYmd(now),
        // Mismo predicado que el KPI vivo: conteo COMPLETO, no el top 5 de la card.
        risk_count: splitRiskClients(pulse).riskCount,
        active_clients: clientsCount,
        avg_adherence: averageAdherence(mapDirectoryPulseToAdherenceStats(pulse)),
        sessions_7d: countUniqueClientDays(logs, santiagoYmd),
    }
}

/**
 * Snapshotea una lista de coaches en lotes, con UN upsert por lote.
 *
 * Un coach que explota (workspace roto, timeout) no puede tumbar la corrida: se registra su id en
 * `errors` y el lote escribe las filas que sí salieron. La respuesta del cron es 200 con errores
 * parciales, no un 500 que oculta las 40 filas que sí se guardaron.
 */
export async function snapshotCoachKpis(
    admin: DbClient,
    coachIds: string[],
    now: Date,
    opts?: { concurrency?: number }
): Promise<{ day: string; snapshotted: number; errors: string[] }> {
    const day = santiagoYmd(now)
    const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY)
    const errors: string[] = []
    let snapshotted = 0

    for (let i = 0; i < coachIds.length; i += concurrency) {
        const batch = coachIds.slice(i, i + concurrency)
        const settled = await Promise.allSettled(batch.map((coachId) => computeCoachKpiSnapshot(admin, coachId, now)))

        const rows: CoachKpiSnapshotInsert[] = []
        settled.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                rows.push(result.value)
                return
            }
            // Solo el id del coach y el mensaje: nada de nombres, correos ni datos de alumnos.
            const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
            errors.push(`coach ${batch[index]}: ${message}`)
        })

        if (rows.length === 0) continue

        const { error } = await upsertCoachKpiSnapshots(admin, rows)
        if (error) {
            errors.push(`upsert lote ${Math.floor(i / concurrency) + 1}: ${error}`)
            continue
        }
        snapshotted += rows.length
    }

    return { day, snapshotted, errors }
}

/**
 * Corrida completa: TODOS los coaches, sin filtrar por plan ni por cartera.
 *
 * El coach sin alumnos recibe una fila en cero, y eso es lo correcto: cuando sume su primero, el
 * delta de la semana siguiente tiene contra qué compararse. Son 4 enteros por fila: barato.
 */
export async function snapshotAllCoachKpis(
    admin: DbClient,
    now: Date,
    opts?: { concurrency?: number }
): Promise<{ day: string; snapshotted: number; errors: string[] }> {
    const { data, error } = await admin.from('coaches').select('id')
    if (error) throw new Error(`no se pudo listar coaches: ${error.message}`)

    const coachIds = (data ?? []).map((row) => row.id as string)
    return snapshotCoachKpis(admin, coachIds, now, opts)
}
