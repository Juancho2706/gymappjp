import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod/v4'
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

const ExportFiltersSchema = z.object({
    action: z.string().min(1).max(120).optional(),
    actor_id: z.uuid().optional(),
    target_type: z.string().min(1).max(80).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(1000),
})

function readFilters(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    return ExportFiltersSchema.safeParse({
        action: searchParams.get('action') || undefined,
        actor_id: searchParams.get('actor_id') || undefined,
        target_type: searchParams.get('target_type') || undefined,
        from: searchParams.get('from') || undefined,
        to: searchParams.get('to') || undefined,
        limit: searchParams.get('limit') || undefined,
    })
}

export async function GET(request: NextRequest, { params }: Params) {
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

    const parsedFilters = readFilters(request)
    if (!parsedFilters.success) {
        return NextResponse.json({ error: 'Invalid export filters' }, { status: 400 })
    }

    const filters = {
        action: parsedFilters.data.action,
        actorId: parsedFilters.data.actor_id,
        targetType: parsedFilters.data.target_type,
        from: parsedFilters.data.from,
        to: parsedFilters.data.to,
    }
    const logs = await findOrgAuditLogs(supabase, context.org.id, parsedFilters.data.limit, filters)
    const csv = buildCsv(logs)
    const checksum = createHash('sha256').update(csv, 'utf8').digest('hex')

    const auditResult = await writeOrgAuditEvent(supabase, {
        orgId: context.org.id,
        actorId: user.id,
        action: 'audit.exported',
        targetType: 'org_audit_logs',
        targetId: context.org.id,
        metadata: {
            format: 'csv',
            permission: 'org.audit.export',
            scope: 'filtered_events',
            filters,
            row_count: logs.length,
            checksum_sha256: checksum,
        },
    })

    if (auditResult.error) {
        return NextResponse.json({ error: 'Audit export blocked: audit event failed' }, { status: 500 })
    }

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename(slug)}"`,
            'Cache-Control': 'no-store',
            'X-Content-SHA256': checksum,
        },
    })
}
