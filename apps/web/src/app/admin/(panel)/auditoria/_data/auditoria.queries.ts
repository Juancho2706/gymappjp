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

export async function getAuditLogs(params: {
    action?: string
    from?: string
    to?: string
    target?: string
    page?: number
    limit?: number
}): Promise<AuditLogsResult> {
    noStore()
    const admin = createServiceRoleClient()
    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const { data, error } = await (admin.rpc as any)('get_admin_audit_logs_paginated', {
        p_action: params.action || null,
        p_from: params.from ? new Date(params.from).toISOString() : null,
        p_to: params.to ? new Date(params.to + 'T23:59:59Z').toISOString() : null,
        p_target: params.target || null,
        p_limit: limit,
        p_offset: offset,
    })

    if (error) {
        console.error('[auditoria] query error:', error)
        return { rows: [], totalCount: 0 }
    }

    const rows = (data ?? []) as unknown as (AuditLogRow & { total_count: number })[]
    const totalCount = rows[0]?.total_count ?? 0

    return {
        rows: rows.map(r => ({
            id: r.id,
            admin_email: r.admin_email,
            action: r.action,
            target_table: r.target_table,
            target_id: r.target_id,
            payload: r.payload as Record<string, unknown> | null,
            ip_address: r.ip_address,
            created_at: r.created_at,
        })),
        totalCount,
    }
}
