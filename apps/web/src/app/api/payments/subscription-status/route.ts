import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: coach, error } = await supabase
        .from('coaches')
        .select(
            'id, subscription_tier, subscription_status, max_clients, billing_cycle, current_period_end, payment_provider, subscription_mp_id, superseded_mp_preapproval_id'
        )
        .eq('id', user.id)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!coach) {
        return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }

    const { data: events } = await supabase
        .from('subscription_events')
        .select('id, provider_status, provider, created_at, provider_checkout_id, payload')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

    return NextResponse.json({ coach, events: events ?? [] })
}
