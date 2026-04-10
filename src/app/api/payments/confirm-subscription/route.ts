import { NextResponse } from 'next/server'
import { addMonths } from 'date-fns'
import { z } from 'zod'
import { BILLING_CYCLE_CONFIG } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const schema = z.object({
    preapprovalId: z.string().min(1).optional(),
})

function mapProviderStatus(status?: string | null) {
    if (!status) return 'pending_payment'
    if (['approved', 'authorized'].includes(status)) return 'active'
    if (['pending', 'in_process', 'in_mediation'].includes(status)) return 'pending_payment'
    if (status === 'paused') return 'paused'
    if (['cancelled', 'canceled'].includes(status)) return 'canceled'
    if (['rejected', 'refunded', 'charged_back'].includes(status)) return 'expired'
    return 'pending_payment'
}

function buildMpHeaders(accessToken: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    }
    if (accessToken.startsWith('TEST-')) headers['X-scope'] = 'stage'
    return headers
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown = {}
        try {
            body = await request.json()
        } catch {
            // Empty body is acceptable
        }

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select('id, billing_cycle, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }

        const preapprovalId = parsed.data.preapprovalId ?? coach.subscription_mp_id ?? undefined
        if (!preapprovalId) {
            return NextResponse.json({ error: 'No subscription id to confirm.' }, { status: 400 })
        }

        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
        if (!accessToken) {
            return NextResponse.json({ error: 'Missing MERCADOPAGO_ACCESS_TOKEN' }, { status: 500 })
        }

        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
            headers: buildMpHeaders(accessToken),
        })

        if (!mpRes.ok) {
            const text = await mpRes.text()
            const requestId = mpRes.headers.get('x-request-id')
            return NextResponse.json(
                {
                    error: `MercadoPago confirm failed (${mpRes.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`,
                },
                { status: 502 }
            )
        }

        const preapproval = await mpRes.json()
        const externalReference = String(preapproval.external_reference ?? '')
        const [coachIdFromRef] = externalReference.split('|')

        if (coachIdFromRef && coachIdFromRef !== user.id) {
            return NextResponse.json({ error: 'Subscription does not belong to current user.' }, { status: 403 })
        }

        const billingCycle = (coach.billing_cycle || 'monthly') as keyof typeof BILLING_CYCLE_CONFIG
        const months = BILLING_CYCLE_CONFIG[billingCycle]?.months ?? 1
        const status = mapProviderStatus(preapproval.status ?? null)
        const nextPeriodEnd = status === 'active' ? addMonths(new Date(), months).toISOString() : null

        await admin
            .from('coaches')
            .update({
                subscription_status: status,
                current_period_end: nextPeriodEnd,
                payment_provider: 'mercadopago',
            })
            .eq('id', user.id)

        return NextResponse.json({
            ok: true,
            subscriptionStatus: status,
            providerStatus: preapproval.status ?? null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar la suscripción.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
