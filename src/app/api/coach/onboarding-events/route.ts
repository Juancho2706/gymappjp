import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { jsonRateLimited, rateLimitCoachOnboardingEvents } from '@/lib/rate-limit'

const schema = z.object({
    stepKey: z.enum(['profile_branding', 'first_client', 'first_plan', 'first_checkin']),
    eventType: z.enum(['step_completed', 'step_reopened', 'aha_moment', 'guide_engagement']),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

/** FK violation: coach_id no existe en coaches */
const PG_FOREIGN_KEY_VIOLATION = '23503'

/** No insertar duplicados del mismo triple si ocurrió hace menos de esto (re-renders React / Strict Mode). */
const DEDUPE_WINDOW_MS = 5000

export async function POST(request: Request) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await rateLimitCoachOnboardingEvents(user.id)
    if (!rl.ok) {
        return jsonRateLimited(rl.retryAfter)
    }

    const rawText = await request.text()
    let body: unknown
    try {
        body = rawText.trim() === '' ? null : JSON.parse(rawText)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
    }

    const admin = createServiceRoleClient()

    /** Interacciones UI (viñetas, Three): no dedupe por ventana — analítica de frecuencia. */
    if (parsed.data.eventType !== 'guide_engagement') {
        const { data: lastDup } = await admin
            .from('coach_onboarding_events')
            .select('id, created_at')
            .eq('coach_id', user.id)
            .eq('step_key', parsed.data.stepKey)
            .eq('event_type', parsed.data.eventType)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (lastDup?.created_at) {
            const lastMs = new Date(lastDup.created_at).getTime()
            if (!Number.isNaN(lastMs) && Date.now() - lastMs < DEDUPE_WINDOW_MS) {
                return NextResponse.json({ ok: true, deduped: true })
            }
        }
    }

    const { error } = await admin.from('coach_onboarding_events').insert({
        coach_id: user.id,
        step_key: parsed.data.stepKey,
        event_type: parsed.data.eventType,
        metadata: parsed.data.metadata ?? null,
    })

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
