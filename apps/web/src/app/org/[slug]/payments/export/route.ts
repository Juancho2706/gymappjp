import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod/v4'
import { orgRoleCan } from '@/domain/org/permissions'
import { createClient } from '@/lib/supabase/server'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

interface Params {
    params: Promise<{ slug: string }>
}

const ExportFiltersSchema = z.object({
    status: z.enum(['all', 'paid', 'pending', 'overdue', 'scholarship', 'paused', 'missing']).default('all'),
})

function sanitizeCsvValue(value: unknown): string {
    const text = value == null ? '' : String(value)
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safeText.replace(/"/g, '""')}"`
}

function csvFilename(slug: string) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return `eva-${slug}-payments-${stamp}.csv`
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

    if (!orgRoleCan(context.membership.role, 'org.payments.export')) {
        return NextResponse.json({ error: 'Missing permission: org.payments.export' }, { status: 403 })
    }

    const parsedFilters = ExportFiltersSchema.safeParse({
        status: request.nextUrl.searchParams.get('status') || 'all',
    })
    if (!parsedFilters.success) {
        return NextResponse.json({ error: 'Invalid export filters' }, { status: 400 })
    }

    const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, full_name, email, phone, is_active, coach_id')
        .eq('org_id', context.org.id)
        .order('full_name', { ascending: true })
    if (clientsError) {
        return NextResponse.json({ error: clientsError.message }, { status: 500 })
    }

    const clientIds = (clients ?? []).map((client) => client.id)
    const paymentsByClient = new Map<string, {
        id: string
        amount: number
        payment_date: string
        status: string
        service_description: string
        created_at: string
    }>()

    if (clientIds.length > 0) {
        const { data: payments, error: paymentsError } = await supabase
            .from('client_payments')
            .select('id, client_id, amount, payment_date, status, service_description, created_at')
            .in('client_id', clientIds)
            .order('payment_date', { ascending: false })
            .order('created_at', { ascending: false })
        if (paymentsError) {
            return NextResponse.json({ error: paymentsError.message }, { status: 500 })
        }

        for (const payment of payments ?? []) {
            if (!paymentsByClient.has(payment.client_id)) {
                paymentsByClient.set(payment.client_id, {
                    id: payment.id,
                    amount: Number(payment.amount),
                    payment_date: payment.payment_date,
                    status: payment.status,
                    service_description: payment.service_description,
                    created_at: payment.created_at,
                })
            }
        }
    }

    const rows = (clients ?? [])
        .map((client) => {
            const payment = paymentsByClient.get(client.id)
            const status = client.is_active === false ? 'paused' : payment?.status ?? 'missing'
            return {
                client_id: client.id,
                full_name: client.full_name,
                email: client.email,
                phone: client.phone,
                coach_id: client.coach_id,
                client_active: client.is_active !== false,
                payment_status: status,
                payment_id: payment?.id ?? null,
                amount: payment?.amount ?? null,
                payment_date: payment?.payment_date ?? null,
                service_description: payment?.service_description ?? null,
            }
        })
        .filter((row) => parsedFilters.data.status === 'all' || row.payment_status === parsedFilters.data.status)

    const header = [
        'client_id',
        'full_name',
        'email',
        'phone',
        'coach_id',
        'client_active',
        'payment_status',
        'payment_id',
        'amount',
        'payment_date',
        'service_description',
    ]

    const csv = [
        header.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => header.map((key) => sanitizeCsvValue(row[key as keyof typeof row])).join(',')),
    ].join('\n')
    const checksum = createHash('sha256').update(csv, 'utf8').digest('hex')

    const auditResult = await writeOrgAuditEvent(supabase, {
        orgId: context.org.id,
        actorId: user.id,
        action: 'client_payments.exported',
        targetType: 'client_payments',
        targetId: context.org.id,
        metadata: {
            format: 'csv',
            permission: 'org.payments.export',
            filters: parsedFilters.data,
            row_count: rows.length,
            checksum_sha256: checksum,
            legal_scope: 'operational_record_not_tax_invoice',
        },
    })

    if (auditResult.error) {
        return NextResponse.json({ error: 'Payment export blocked: audit event failed' }, { status: 500 })
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
