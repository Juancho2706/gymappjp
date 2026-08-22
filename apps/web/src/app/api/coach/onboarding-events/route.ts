import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { jsonRateLimited, rateLimitCoachOnboardingEvents } from '@/lib/rate-limit'

const schema = z.object({
    // Pasos v2 (`vive_tu_app`, `first_artifact`, `aha`) + los legacy `first_plan`/`first_checkin`,
    // que siguen vivos en las filas históricas y en el checklist viejo hasta que W2 lo reemplace.
    stepKey: z.enum([
        'profile_branding',
        'vive_tu_app',
        'first_artifact',
        'first_client',
        'aha',
        'first_plan',
        'first_checkin',
    ]),
    // Espejo EXACTO del CHECK de `coach_onboarding_events` (migración
    // 20260822002122_onboarding_v2_persona_demo.sql). Si acá entra un tipo que la DB no admite, el
    // insert muere en 500: los dos listados se mueven juntos.
    eventType: z.enum([
        'step_completed',
        'step_reopened',
        'aha_moment',
        'guide_engagement',
        'persona_selected',
        'demo_seeded',
        'demo_deleted',
        'vive_tu_app_opened',
        'invite_link_copied',
        'invite_whatsapp_opened',
        'onboarding_dismissed',
        'first_module_opened',
    ]),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

/** FK violation: coach_id no existe en coaches */
const PG_FOREIGN_KEY_VIOLATION = '23503'

/** Unique violation: el índice parcial `coach_onboarding_events_step_completed_once` ya tiene el paso. */
const PG_UNIQUE_VIOLATION = '23505'

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
        // Dedupe DURO de `step_completed`: un paso se completa una sola vez por coach y el índice
        // único parcial lo garantiza en la DB (el dedupe por ventana de 5 s de arriba solo tapa
        // re-renders del mismo render pass; el re-emit que dejó 2.293 filas venía de sesiones
        // distintas). Rechazarlo con 500 haría ruido en Sentry por el camino ESPERADO, así que se
        // responde igual que el dedupe por ventana.
        if (error.code === PG_UNIQUE_VIOLATION) {
            return NextResponse.json({ ok: true, deduped: true })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
