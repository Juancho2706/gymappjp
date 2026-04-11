import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const schema = z.object({
    stepKey: z.enum(['profile_branding', 'first_client', 'first_plan', 'first_checkin']),
    eventType: z.enum(['step_completed', 'step_reopened', 'aha_moment']),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

export async function POST(request: Request) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const db = admin as any

    const { data: coach } = await admin
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) {
        return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }

    const { error } = await db.from('coach_onboarding_events').insert({
        coach_id: user.id,
        step_key: parsed.data.stepKey,
        event_type: parsed.data.eventType,
        metadata: parsed.data.metadata ?? null,
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
