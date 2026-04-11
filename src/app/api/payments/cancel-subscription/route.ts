import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        let reason = ''
        try {
            const body = await request.json()
            reason = String(body?.reason ?? '').trim()
        } catch {
            reason = ''
        }

        const admin = createServiceRoleClient()
        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: 'canceled',
                current_period_end: null,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        const payload: Json | null = reason ? ({ cancel_reason: reason } as Json) : null

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: 'mercadopago',
            provider_event_id: `manual-cancel:${user.id}:${Date.now()}`,
            provider_status: 'canceled',
            payload,
        }

        await admin.from('subscription_events').insert(eventRow)

        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado' },
            { status: 500 }
        )
    }
}
