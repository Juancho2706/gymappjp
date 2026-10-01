import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    listActiveByCoachesAndKey,
    listByCoachesSince,
    type CoachEmailLedgerRow,
} from '@/infrastructure/db/coach-email-ledger.repository'
import {
    AUTOMATED_EMAIL_WEEK_MS,
    EMAIL_OPT_OUT_TEMPLATE_KEY,
} from '@/lib/email/automated-email-policy'

/**
 * Historial de correos automáticos por coach, leído de LOS DOS registros (plan «Correos y
 * activación», 01-10): `coach_email_ledger` (W6, carrito abandonado, drip) y `admin_audit_logs`
 * (aviso de cupo, por evento y por barrido). Alimenta la regla compartida de
 * `lib/email/automated-email-policy.ts`.
 *
 * LANZA ante cualquier fallo de lectura. Cada caller decide, y los tres barridos que lo usan
 * (W6, cupo, carrito) eligen FAIL-CLOSED: sin historial no hay forma de saber si ya le escribimos
 * hoy, y la corrida siguiente —una hora o un día después— lo vuelve a intentar sin perder nada.
 */

type Db = SupabaseClient<Database>

/** Acción del aviso de cupo en `admin_audit_logs` (espejo de `SALES_EMAIL_AUDIT_ACTIONS`). */
export const CAP_EMAIL_AUDIT_ACTION = 'coach.sales_email_client_limit_reached'

/**
 * Gatillos del ledger que son correos que EVA inicia sola (o que responden a un intento) y por eso
 * CUENTAN para el cupo. `transactional` (bienvenida, confirmación, pagos) no cuenta: es la respuesta
 * a algo que el coach acaba de hacer y no compite con la serie.
 */
const COUNTED_LEDGER_TRIGGERS: readonly string[] = ['behavior', 'sweep', 'drip', 'attempt']

/**
 * Estados que significan «este correo está o va a estar en su bandeja». `bounced`/`complained`/
 * `cancelled` no llegaron (o los retiramos), así que no hay nada que espaciar.
 */
const DELIVERABLE_STATUSES: readonly string[] = ['sent', 'delivered', 'scheduled']

/** Lookback del ledger: la semana del cupo y la ventana del aha caben de sobra. */
const LEDGER_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
/** Tamaño de chunk de ids para los `.in` (evita URLs gigantes en el query string). */
const COACH_ID_CHUNK = 100
const PAGE_SIZE = 1000
const MAX_PAGES = 50

export interface CoachAutomatedEmailHistory {
    /** Instantes de los correos automáticos que cuentan para el cupo (los dos registros). */
    sentAts: string[]
    /** Cuándo salió «Tu alumno ya está adentro» (W6), si fue en los últimos 30 días. */
    ahaAt: string | null
    /** Marca de baja viva: no se le escribe nada automático. */
    optedOut: boolean
}

function emptyHistory(): CoachAutomatedEmailHistory {
    return { sentAts: [], ahaAt: null, optedOut: false }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

/**
 * Instante efectivo de una fila: `sent_at` es el dato bueno, `scheduled_at` cubre la que espera
 * turno y `created_at` es el piso cuando el webhook de Resend nunca movió la fila.
 */
function ledgerInstant(row: CoachEmailLedgerRow): string | null {
    return row.sent_at ?? row.scheduled_at ?? row.created_at ?? null
}

async function readCapAudit(
    admin: Db,
    coachIds: string[],
    sinceIso: string
): Promise<Array<{ target_id: string | null; created_at: string | null }>> {
    const out: Array<{ target_id: string | null; created_at: string | null }> = []
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE
        const { data, error } = await admin
            .from('admin_audit_logs')
            .select('target_id, created_at')
            .eq('action', CAP_EMAIL_AUDIT_ACTION)
            .in('target_id', coachIds)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
        if (error) throw new Error(`admin_audit_logs: ${error.message}`)
        const rows = data ?? []
        out.push(...rows)
        if (rows.length < PAGE_SIZE) break
    }
    return out
}

/**
 * Historial de cada coach del lote. Todo coach pedido aparece en el mapa (vacío si no tiene nada).
 */
export async function loadAutomatedEmailHistory(
    admin: Db,
    coachIds: readonly string[],
    now: Date
): Promise<Map<string, CoachAutomatedEmailHistory>> {
    const byCoach = new Map<string, CoachAutomatedEmailHistory>()
    for (const id of coachIds) byCoach.set(id, emptyHistory())
    if (coachIds.length === 0) return byCoach

    const ledgerSince = new Date(now.getTime() - LEDGER_LOOKBACK_MS).toISOString()
    const weekSince = new Date(now.getTime() - AUTOMATED_EMAIL_WEEK_MS).toISOString()
    const ahaSinceMs = now.getTime() - LEDGER_LOOKBACK_MS

    for (const chunk of chunked([...byCoach.keys()], COACH_ID_CHUNK)) {
        const [ledgerRows, optOuts, capRows] = await Promise.all([
            listByCoachesSince(admin, chunk, ledgerSince),
            listActiveByCoachesAndKey(admin, chunk, EMAIL_OPT_OUT_TEMPLATE_KEY),
            readCapAudit(admin, chunk, weekSince),
        ])

        for (const row of ledgerRows) {
            const history = byCoach.get(row.coach_id)
            if (!history || !DELIVERABLE_STATUSES.includes(row.status)) continue
            const at = ledgerInstant(row)
            if (!at) continue
            if (row.template_key === 'behavior_aha') {
                const ms = new Date(at).getTime()
                const prev = history.ahaAt ? new Date(history.ahaAt).getTime() : -Infinity
                if (Number.isFinite(ms) && ms >= ahaSinceMs && ms > prev) history.ahaAt = at
            }
            if (COUNTED_LEDGER_TRIGGERS.includes(row.trigger)) history.sentAts.push(at)
        }

        for (const row of optOuts) {
            const history = byCoach.get(row.coach_id)
            if (history) history.optedOut = true
        }

        for (const row of capRows) {
            if (!row.target_id || !row.created_at) continue
            byCoach.get(row.target_id)?.sentAts.push(row.created_at)
        }
    }

    return byCoach
}
