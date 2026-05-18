'use server'

import { assertAdmin } from '@/lib/admin/admin-action-wrapper'
import { format } from 'date-fns'

export async function exportAuditCsvAction(params: {
    action?: string
    from?: string
    to?: string
    target?: string
}): Promise<{ csv: string } | { error: string }> {
    const { adminClient } = await assertAdmin()

    let query = adminClient
        .from('admin_audit_logs')
        .select('id, admin_email, action, target_table, target_id, ip_address, created_at')
        .order('created_at', { ascending: false })
        .limit(5000)

    if (params.action) query = query.eq('action', params.action)
    if (params.from) query = query.gte('created_at', new Date(params.from).toISOString())
    if (params.to) query = query.lte('created_at', new Date(params.to + 'T23:59:59Z').toISOString())
    if (params.target) query = query.eq('target_id', params.target)

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = data ?? []
    const header = ['id', 'admin_email', 'action', 'target_table', 'target_id', 'ip_address', 'created_at']
    const lines = [
        header.join(','),
        ...rows.map(r => [
            r.id,
            r.admin_email,
            r.action,
            r.target_table ?? '',
            r.target_id ?? '',
            r.ip_address ?? '',
            format(new Date(r.created_at), "yyyy-MM-dd'T'HH:mm:ss"),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ]

    return { csv: lines.join('\n') }
}
