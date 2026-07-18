/**
 * student-access.server — capa SERVER del gate de acceso de alumnos (B1). Aparte de la parte
 * client-safe (`student-access.ts`) porque lee Edge Config (kill-switch) y la fila del coach.
 *
 * DEFENSA EN PROFUNDIDAD: esta capa (proxy / server actions / mobile config) es cosmetica/UX. La
 * barrera REAL de datos es la RLS de la base (RN habla PostgREST directo). La RLS NO lee Edge Config,
 * asi que el kill-switch de abajo NO la afecta (documentado en la migracion de B2). Todos los
 * resolvers son fail-OPEN (`ok`) ante gate apagado, coach ausente/no legible o falta de `coachId`:
 * jamas bloqueamos al alumno por un fallo de lectura de esta capa.
 */

import {
    resolveStudentAccessState,
    type CoachAccessColumns,
    type StudentAccessResult,
} from '@/lib/student-access'

const STUDENT_ACCESS_GATE_KEY = 'STUDENT_ACCESS_GATE'

/**
 * Kill-switch de operador (Edge Config, mismo patron que `nutrition-v2-rollout.service`).
 * Ausente / `true` / error de Edge Config → gate ACTIVO (default seguro). SOLO el booleano `false`
 * lo apaga. Afecta EXCLUSIVAMENTE las capas UI/actions — la RLS de la base NO lee Edge Config.
 */
export async function isStudentAccessGateEnabled(): Promise<boolean> {
    if (!process.env.EDGE_CONFIG) return true
    try {
        const { get } = await import('@vercel/edge-config')
        const raw = await get<unknown>(STUDENT_ACCESS_GATE_KEY)
        return raw !== false
    } catch {
        return true
    }
}

/**
 * Cliente PostgREST minimo (satisfecho por el cliente server-scoped y el service-role). `from`
 * devuelve `any` a proposito: tipar el builder completo de supabase-js dispara TS2589 (instanciacion
 * excesivamente profunda) al chequear la asignabilidad del `SupabaseClient<Database>` gigante.
 */
interface CoachColumnsReader {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(relation: string): any
}

/**
 * Lee las columnas de suscripcion del coach y aplica el kill-switch. `gateEnabled`/`now` inyectables
 * para reusar una resolucion previa o testear sin Edge Config.
 */
export async function resolveStudentAccessForCoach(
    db: CoachColumnsReader,
    coachId: string | null | undefined,
    opts: { now?: number; gateEnabled?: boolean } = {},
): Promise<StudentAccessResult> {
    const gateEnabled = opts.gateEnabled ?? (await isStudentAccessGateEnabled())
    if (!gateEnabled) return { state: 'ok', graceEndsAt: null }
    if (!coachId) return { state: 'ok', graceEndsAt: null }

    try {
        const { data } = await db
            .from('coaches')
            .select('subscription_status, current_period_end, paid_access_ended_at')
            .eq('id', coachId)
            .maybeSingle()
        if (!data) return { state: 'ok', graceEndsAt: null }
        return resolveStudentAccessState(data as CoachAccessColumns, opts.now)
    } catch {
        // Fail-OPEN: un fallo de lectura de esta capa cosmetica jamas debe 500ear una escritura
        // legitima. La RLS/RPC es la barrera real de datos.
        return { state: 'ok', graceEndsAt: null }
    }
}

/**
 * Deriva el coach desde `clients.coach_id` y resuelve el acceso. Usado por las server actions de
 * escritura que solo tienen el `clientId` de la sesion. Fail-OPEN ante cualquier fallo de lectura.
 */
export async function resolveStudentAccessForClient(
    db: CoachColumnsReader,
    clientId: string,
    opts: { now?: number; gateEnabled?: boolean } = {},
): Promise<StudentAccessResult> {
    const gateEnabled = opts.gateEnabled ?? (await isStudentAccessGateEnabled())
    if (!gateEnabled) return { state: 'ok', graceEndsAt: null }

    let coachId: string | null = null
    try {
        const { data } = await db
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .maybeSingle()
        coachId = (data as { coach_id?: string | null } | null)?.coach_id ?? null
    } catch {
        return { state: 'ok', graceEndsAt: null } // fail-OPEN ante fallo de lectura
    }
    return resolveStudentAccessForCoach(db, coachId, { ...opts, gateEnabled })
}
