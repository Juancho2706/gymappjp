import { NextResponse, type NextRequest } from 'next/server'
import { orgRoleCan } from '@/domain/org/permissions'
import { findOrgAuditLogs } from '@/infrastructure/db/org.repository'
import { createClient } from '@/lib/supabase/server'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

interface Params {
    params: Promise<{ slug: string }>
}

function csvCell(value: unknown): string {
    const text = value == null ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
}

function buildCsv(rows: Awaited<ReturnType<typeof findOrgAuditLogs>>) {
    const header = ['created_at', 'actor_id', 'action', 'target_type', 'target_id', 'metadata']
    const lines = rows.map((row) => [
        row.created_at,
        row.actor_id,
        row.action,
        row.target_type,
        row.target_id,
        JSON.stringify(row.metadata ?? {}),
    ].map(csvCell).join(','))

    return [header.map(csvCell).join(','), ...lines].join('\n')
}

function csvFilename(slug: string) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return `eva-${slug}-audit-${stamp}.csv`
}

export async function GET(_request: NextRequest, { params }: Params) {
    const { slug } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const context = await getOrgAdminContext(supabase, user.id, slug, ['org_owner', 'org_admin'])
    if ('error' in context) {
        return NextResponse.json({ error: context.error }, { status: 403 })
    }

    if (!orgRoleCan(context.membership.role, 'org.audit.export')) {
        return NextResponse.json({ error: 'Missing permission: org.audit.export' }, { status: 403 })
    }

    const auditResult = await writeOrgAuditEvent(supabase, {
        orgId: context.org.id,
        actorId: user.id,
        action: 'audit.exported',
        targetType: 'org_audit_logs',
        targetId: context.org.id,
        metadata: {
            format: 'csv',
            permission: 'org.audit.export',
            scope: 'latest_1000_events',
        },
    })

    if (auditResult.error) {
        return NextResponse.json({ error: 'Audit export blocked: audit event failed' }, { status: 500 })
    }

    const logs = await findOrgAuditLogs(supabase, context.org.id, 1000)
    const csv = buildCsv(logs)

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename(slug)}"`,
            'Cache-Control': 'no-store',
        },
    })
}
