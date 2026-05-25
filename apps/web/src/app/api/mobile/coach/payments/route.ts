import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { addPaymentForCoach } from '@/services/client/client.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

const AddPaymentSchema = z.object({
    clientId: z.string().uuid(),
    amount: z.number().int().positive(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceDescription: z.string().min(1).max(180),
    periodMonths: z.number().int().positive().optional().nullable(),
})

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = AddPaymentSchema.safeParse({
        clientId: body?.clientId ?? body?.client_id ?? '',
        amount: Number(body?.amount),
        paymentDate: body?.paymentDate ?? body?.payment_date ?? '',
        serviceDescription: body?.serviceDescription ?? body?.service_description ?? '',
        periodMonths: body?.periodMonths ?? body?.period_months ?? undefined,
    })

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Datos invalidos.', code: 'VALIDATION_ERROR', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 }
        )
    }

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData.user

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const workspace = await resolvePreferredWorkspace(admin, user.id)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return NextResponse.json({ error: 'Workspace no autorizado para pagos.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    const orgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null

    let clientQuery = admin
        .from('clients')
        .select('id')
        .eq('id', parsed.data.clientId)
        .eq('coach_id', user.id)
    clientQuery = applyOrgScope(clientQuery, orgId)
    const { data: client, error: clientError } = await clientQuery.maybeSingle()

    if (clientError) {
        return NextResponse.json({ error: 'No se pudo validar el alumno.', code: 'CLIENT_CHECK_FAILED' }, { status: 500 })
    }
    if (!client) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'CLIENT_NOT_FOUND' }, { status: 404 })
    }

    try {
        await addPaymentForCoach(admin, user.id, {
            client_id: parsed.data.clientId,
            amount: parsed.data.amount,
            payment_date: parsed.data.paymentDate,
            service_description: parsed.data.serviceDescription,
            period_months: parsed.data.periodMonths ?? undefined,
            status: 'paid',
        })
    } catch {
        return NextResponse.json({ error: 'No se pudo registrar el pago.', code: 'PAYMENT_CREATE_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
