'use server'

import { assertAdmin } from '@/lib/admin/admin-action-wrapper'
import { normalizeAuditRange } from '../_data/auditoria.queries'
import { format } from 'date-fns'

const MAX_ROWS = 5000
const BOM = '\ufeff'
const TRUNCATION_NOTICE = `AVISO: export truncado a ${MAX_ROWS} filas — ajusta los filtros`

const HEADER = ['id', 'admin_email', 'action', 'target_table', 'target_id', 'ip_address', 'created_at', 'payload']

export type ExportAuditCsvResult = { csv: string; truncated: boolean } | { error: string }

function csvCell(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function csvRow(values: unknown[]): string {
    return values.map(csvCell).join(',')
}

export async function exportAuditCsvAction(params: {
    action?: string
    admin?: string
    from?: string
    to?: string
    target?: string
}): Promise<ExportAuditCsvResult> {
    const { adminClient } = await assertAdmin()

    let query = adminClient
        .from('admin_audit_logs')
        .select('id, admin_email, action, target_table, target_id, ip_address, created_at, payload')
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS)

    const { fromIso, toIso } = normalizeAuditRange(params.from, params.to)
    const adminEmail = params.admin?.trim()
    const target = params.target?.trim()

    if (params.action) query = query.eq('action', params.action)
    if (adminEmail) query = query.ilike('admin_email', `%${adminEmail.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    if (fromIso) query = query.gte('created_at', fromIso)
    if (toIso) query = query.lte('created_at', toIso)
    if (target) query = query.eq('target_id', target)

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = data ?? []
    // Tope alcanzado ⇒ hay filas que NO viajaron en el archivo. Se avisa dentro del CSV (el archivo
    // sobrevive al toast) y por bandera para que el botón lo muestre al descargar.
    const truncated = rows.length >= MAX_ROWS

    const lines = [
        HEADER.join(','),
        ...rows.map((r) =>
            csvRow([
                r.id,
                r.admin_email,
                r.action,
                r.target_table ?? '',
                r.target_id ?? '',
                r.ip_address ?? '',
                format(new Date(r.created_at), "yyyy-MM-dd'T'HH:mm:ss"),
                r.payload == null ? '' : JSON.stringify(r.payload),
            ])
        ),
    ]

    if (truncated) {
        lines.push(csvRow([TRUNCATION_NOTICE, ...HEADER.slice(1).map(() => '')]))
    }

    // BOM UTF-8: sin él Excel en Windows lee los acentos de los labels como mojibake.
    const body = lines.join('\n')
    return { csv: body.startsWith(BOM) ? body : BOM + body, truncated }
}
