import { unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export interface CronStatus {
    action: string
    label: string
    lastRunAt: string | null
    lastResult: string | null
}

export interface SistemaData {
    checkedAt: string
    dbConnected: boolean
    totalCoaches: number
    totalClients: number
    activeCoaches: number
    betaCoaches: number
    expiredCoaches: number
    overdueCoaches: number
    recentAuditCount: number
    lastAuditAt: string | null
    /** Ultima accion de auditoria < 48h respecto de `checkedAt`. Se computa aca (capa de datos)
     *  y no en el render: `Date.now()` en un componente viola la regla de pureza del lint. */
    auditActive: boolean
    orphanCoaches: number
    migrationsCount: number
    cronStatuses: CronStatus[]
}

/** Fila minima de coaches sobre la que se derivan los 6 contadores del panel. */
interface CoachHealthRow {
    subscription_status: string
    payment_provider: string
    current_period_end: string | null
}

const ACTIVE_STATUSES = ['active', 'trialing']
const OVERDUE_STATUSES = ['past_due', 'pending_payment']

/**
 * Deriva en TS los mismos 6 conteos que antes costaban 6 round-trips a `coaches`.
 * Predicados 1:1 con los filtros PostgREST originales — ojo con `orphan`: `.lt()`
 * descarta NULL en Postgres, asi que aca `current_period_end == null` NO cuenta.
 */
function countCoaches(rows: CoachHealthRow[], nowMs: number) {
    let active = 0, beta = 0, expired = 0, overdue = 0, orphan = 0

    for (const row of rows) {
        const status = row.subscription_status
        const isBeta = row.payment_provider === 'beta'

        if (ACTIVE_STATUSES.includes(status)) active++
        if (isBeta) beta++
        if (status === 'expired') expired++
        if (OVERDUE_STATUSES.includes(status)) overdue++

        if (status === 'active' && isBeta && row.current_period_end) {
            const endMs = Date.parse(row.current_period_end)
            if (!Number.isNaN(endMs) && endMs < nowMs) orphan++
        }
    }

    return { active, beta, expired, overdue, orphan }
}

export async function getSistemaData(): Promise<SistemaData> {
    noStore()
    const admin = createServiceRoleClient()
    const checkedAt = new Date()

    const CRON_ACTIONS = [
        { action: 'cron.trial_expiry_ran',     label: 'Trial expiry' },
        { action: 'cron.nutrition_cycles_ran', label: 'Nutrition cycles' },
        { action: 'cron.nutrition_reminder_ran', label: 'Nutrition reminder' },
    ]

    try {
        const [
            coachesRes,
            clientsRes,
            auditRecentRes,
            auditLastRes,
            ...cronRes
        ] = await Promise.all([
            // UNA sola lectura de coaches (~30 filas) alimenta total/activos/beta/expirados/
            // morosos/huerfanos legacy. `count: 'exact'` mantiene el total exacto aunque
            // PostgREST recorte filas por db-max-rows.
            admin.from('coaches')
                .select('id, subscription_status, payment_provider, current_period_end', { count: 'exact' }),
            // clients SI es tabla grande: se queda como count head (no traemos filas).
            admin.from('clients').select('id', { count: 'exact', head: true }),
            admin.from('admin_audit_logs').select('id', { count: 'exact', head: true })
                .gte('created_at', new Date(checkedAt.getTime() - 24 * 60 * 60 * 1000).toISOString()),
            // NO fusionable con la de arriba: esta busca el ultimo registro SIN ventana
            // (la page lo compara contra 48h; acotarlo a 24h daria "sin actividad" falso).
            admin.from('admin_audit_logs').select('created_at').order('created_at', { ascending: false }).limit(1),
            ...CRON_ACTIONS.map(({ action }) =>
                admin.from('admin_audit_logs')
                    .select('created_at, target_id')
                    .eq('action', action)
                    .order('created_at', { ascending: false })
                    .limit(1)
            ),
        ])

        const cronStatuses: CronStatus[] = CRON_ACTIONS.map(({ action, label }, i) => {
            const row = (cronRes[i]?.data as any[])?.[0]
            return {
                action,
                label,
                lastRunAt: row?.created_at ?? null,
                lastResult: row?.target_id ?? null,
            }
        })

        const coachRows = (coachesRes.data ?? []) as CoachHealthRow[]
        const totalCoaches = coachesRes.count ?? coachRows.length
        if (coachesRes.count != null && coachesRes.count > coachRows.length) {
            console.warn(
                `[admin/sistema] coaches truncada por PostgREST (${coachRows.length}/${coachesRes.count}): ` +
                'los contadores derivados quedan parciales'
            )
        }
        const derived = countCoaches(coachRows, checkedAt.getTime())

        // supabase-js NO lanza en error: devuelve { data: null, error }. El try/catch de abajo
        // nunca se disparaba y dbConnected era SIEMPRE true con todos los contadores en 0 verde
        // (ROTO-7, F0 08-05). Salud real = ninguna query core con error.
        // La lectura unica de coaches es ahora la señal principal: si falla, se caen 6 contadores.
        const coreErrors = [coachesRes, clientsRes, auditRecentRes].filter((r) => r.error)
        if (coreErrors.length > 0) {
            console.error('[admin/sistema] health check: queries con error', coreErrors.map((r) => r.error?.message))
        }

        return {
            checkedAt: checkedAt.toISOString(),
            dbConnected: coreErrors.length === 0,
            totalCoaches,
            totalClients: clientsRes.count ?? 0,
            activeCoaches: derived.active,
            betaCoaches: derived.beta,
            expiredCoaches: derived.expired,
            overdueCoaches: derived.overdue,
            recentAuditCount: auditRecentRes.count ?? 0,
            lastAuditAt: (auditLastRes.data as any[])?.[0]?.created_at ?? null,
            auditActive: (() => {
                const last = (auditLastRes.data as any[])?.[0]?.created_at
                if (!last) return false
                return checkedAt.getTime() - new Date(last).getTime() < 48 * 60 * 60 * 1000
            })(),
            orphanCoaches: derived.orphan,
            migrationsCount: 0,
            cronStatuses,
        }
    } catch {
        return {
            checkedAt: checkedAt.toISOString(),
            dbConnected: false,
            totalCoaches: 0,
            totalClients: 0,
            activeCoaches: 0,
            betaCoaches: 0,
            expiredCoaches: 0,
            overdueCoaches: 0,
            recentAuditCount: 0,
            lastAuditAt: null,
            auditActive: false,
            orphanCoaches: 0,
            migrationsCount: 0,
            cronStatuses: [],
        }
    }
}
