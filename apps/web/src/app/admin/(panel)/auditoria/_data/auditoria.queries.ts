import { unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export interface AuditLogRow {
    id: string
    admin_email: string
    action: string
    target_table: string | null
    target_id: string | null
    payload: Record<string, unknown> | null
    ip_address: string | null
    created_at: string
}

export interface AuditLogsResult {
    rows: AuditLogRow[]
    totalCount: number
}

export interface AuditLogFilters {
    action?: string
    admin?: string
    from?: string
    to?: string
    target?: string
}

const SELECT_COLUMNS = 'id, admin_email, action, target_table, target_id, payload, ip_address, created_at'

/**
 * Normaliza el rango a ISO. `to` inválido (anterior a `from`) se IGNORA en vez de devolver cero
 * filas — la URL es editable a mano y un rango invertido no debe parecer "sin eventos".
 */
export function normalizeAuditRange(from?: string, to?: string): { fromIso: string | null; toIso: string | null } {
    const fromIso = from ? new Date(from).toISOString() : null
    let toIso = to ? new Date(to + 'T23:59:59Z').toISOString() : null
    if (fromIso && toIso && toIso < fromIso) toIso = null
    return { fromIso, toIso }
}

/** `%` y `_` son comodines de LIKE: escaparlos evita que un pegado accidental amplíe la búsqueda. */
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
    return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null
}

export async function getAuditLogs(
    params: AuditLogFilters & { page?: number; limit?: number }
): Promise<AuditLogsResult> {
    noStore()
    const admin = createServiceRoleClient()
    const limit = params.limit ?? 50
    const page = Math.max(1, params.page ?? 1)
    const offset = (page - 1) * limit

    const { fromIso, toIso } = normalizeAuditRange(params.from, params.to)
    const adminEmail = params.admin?.trim()
    const target = params.target?.trim()

    // La página se lee directo de la tabla (service-role) en vez del RPC paginado: el RPC no acepta
    // filtro por admin_email y su total_count venía de COUNT(*) OVER() — o sea, del propio page slice.
    let rowsQuery = admin
        .from('admin_audit_logs')
        .select(SELECT_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    // FIX: totalCount en query aparte con `head: true`. Antes salía de rows[0].total_count, así que
    // una página vacía (filtro sin resultados o `page` fuera de rango) colapsaba el total a 0 y
    // AdminPagination desaparecía → el usuario quedaba atrapado sin poder volver a la página 1.
    let countQuery = admin.from('admin_audit_logs').select('id', { count: 'exact', head: true })

    if (params.action) {
        rowsQuery = rowsQuery.eq('action', params.action)
        countQuery = countQuery.eq('action', params.action)
    }
    if (adminEmail) {
        const pattern = `%${escapeLikePattern(adminEmail)}%`
        rowsQuery = rowsQuery.ilike('admin_email', pattern)
        countQuery = countQuery.ilike('admin_email', pattern)
    }
    if (fromIso) {
        rowsQuery = rowsQuery.gte('created_at', fromIso)
        countQuery = countQuery.gte('created_at', fromIso)
    }
    if (toIso) {
        rowsQuery = rowsQuery.lte('created_at', toIso)
        countQuery = countQuery.lte('created_at', toIso)
    }
    if (target) {
        rowsQuery = rowsQuery.eq('target_id', target)
        countQuery = countQuery.eq('target_id', target)
    }

    const [rowsRes, countRes] = await Promise.all([rowsQuery, countQuery])

    if (rowsRes.error) {
        console.error('[auditoria] query error:', rowsRes.error)
        return { rows: [], totalCount: 0 }
    }
    if (countRes.error) {
        console.error('[auditoria] count error:', countRes.error)
    }

    const rows = rowsRes.data ?? []

    return {
        rows: rows.map((r) => ({
            id: r.id,
            admin_email: r.admin_email,
            action: r.action,
            target_table: r.target_table,
            target_id: r.target_id,
            payload: toPayloadRecord(r.payload),
            ip_address: r.ip_address,
            created_at: r.created_at,
        })),
        // Si el count falló, caer al largo de la página evita mostrar "0 de 0" con filas en pantalla.
        totalCount: countRes.count ?? rows.length,
    }
}
