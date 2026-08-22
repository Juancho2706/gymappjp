import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Telemetría del onboarding del coach (docs/specs/coach-onboarding-v2/, W1 F1.4).
 *
 * Lo que este test pinnea:
 *  - el `z.enum` de `eventType` es el ESPEJO del CHECK de la tabla (migración
 *    20260822002122_onboarding_v2_persona_demo.sql). `guide_engagement` entraba por la UI y moría
 *    en 500 porque el CHECK del baseline solo admitía 3 tipos; los eventos v2 no pueden repetirlo.
 *  - los pasos v2 (`vive_tu_app`, `first_artifact`, `aha`) se aceptan sin romper los legacy.
 *  - el 23505 del índice único parcial `coach_onboarding_events_step_completed_once` se traduce a
 *    `200 { ok: true, deduped: true }` — es el camino ESPERADO de un paso ya completado, no un
 *    error que deba ensuciar Sentry (el re-emit dejó 2.293 filas de `first_client`).
 *  - el dedupe por ventana de 5 s sigue vivo para los re-renders y NO aplica a `guide_engagement`.
 */

const USER_ID = 'coach-uuid-1'

let authUser: { id: string } | null = { id: USER_ID }
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: authUser } }) },
    }),
}))

let rateLimitOk = true
vi.mock('@/lib/rate-limit', () => ({
    rateLimitCoachOnboardingEvents: async () => ({ ok: rateLimitOk, retryAfter: 30 }),
    jsonRateLimited: () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
}))

/** Última fila del triple (coach, step, event) que devuelve el dedupe por ventana. */
let lastDup: { id: string; created_at: string } | null = null
/** Error que devuelve el insert (null = OK). */
let insertError: { code?: string; message: string } | null = null
const inserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        from: (table: string) => {
            if (table !== 'coach_onboarding_events') throw new Error(`Unexpected table: ${table}`)
            const chain: Record<string, unknown> = {}
            Object.assign(chain, {
                select: () => chain,
                eq: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: lastDup, error: null }),
                insert: async (row: Record<string, unknown>) => {
                    inserts.push(row)
                    return { error: insertError }
                },
            })
            return chain
        },
    }),
}))

import { POST } from './route'

function req(body: unknown) {
    return new Request('http://localhost/api/coach/onboarding-events', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

beforeEach(() => {
    authUser = { id: USER_ID }
    rateLimitOk = true
    lastDup = null
    insertError = null
    inserts.length = 0
})

describe('POST /api/coach/onboarding-events — contrato de eventos v2', () => {
    it('acepta los 12 event_type del CHECK de la tabla', async () => {
        const types = [
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
        ]
        for (const eventType of types) {
            const res = await POST(req({ stepKey: 'profile_branding', eventType }))
            expect(res.status, eventType).toBe(200)
            expect(await res.json()).toEqual({ ok: true })
        }
        expect(inserts).toHaveLength(types.length)
    })

    it('acepta los pasos v2, los legacy y `persona`', async () => {
        const steps = [
            'profile_branding',
            'vive_tu_app',
            'first_artifact',
            'first_client',
            'aha',
            'first_plan',
            'first_checkin',
            // `persona` no es un paso de la guía: es el step_key de los eventos que no le
            // pertenecen a ninguno (`PERSONA_EVENT_STEP_KEY`). Sin él, `persona_selected` emitido
            // desde el cliente moría en 400 mientras el servidor sí lo escribía.
            'persona',
        ]
        for (const stepKey of steps) {
            const res = await POST(req({ stepKey, eventType: 'step_completed' }))
            expect(res.status, stepKey).toBe(200)
        }
        expect(inserts.map((r) => r.step_key)).toEqual(steps)
    })

    it('rechaza un event_type fuera del CHECK con 400 (nunca llega al insert)', async () => {
        const res = await POST(req({ stepKey: 'aha', eventType: 'inventado' }))
        expect(res.status).toBe(400)
        expect(inserts).toHaveLength(0)
    })

    it('rechaza un step_key desconocido con 400', async () => {
        const res = await POST(req({ stepKey: 'first_program', eventType: 'step_completed' }))
        expect(res.status).toBe(400)
        expect(inserts).toHaveLength(0)
    })

    it('persona_selected viaja con su metadata {persona, also_other, surface}', async () => {
        const res = await POST(
            req({
                stepKey: 'persona',
                eventType: 'persona_selected',
                metadata: { persona: 'rehab', also_other: true, surface: 'web' },
            })
        )
        expect(res.status).toBe(200)
        expect(inserts[0]?.metadata).toEqual({ persona: 'rehab', also_other: true, surface: 'web' })
    })
})

describe('POST /api/coach/onboarding-events — dedupe', () => {
    it('23505 del índice único → 200 { ok: true, deduped: true } (no 500)', async () => {
        insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
        const res = await POST(req({ stepKey: 'first_client', eventType: 'step_completed' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deduped: true })
    })

    it('otro error de DB sigue siendo 500', async () => {
        insertError = { code: '42501', message: 'permission denied' }
        const res = await POST(req({ stepKey: 'first_client', eventType: 'step_completed' }))
        expect(res.status).toBe(500)
    })

    it('FK rota (coach inexistente) sigue siendo 404', async () => {
        insertError = { code: '23503', message: 'insert or update violates foreign key constraint' }
        const res = await POST(req({ stepKey: 'first_client', eventType: 'step_completed' }))
        expect(res.status).toBe(404)
    })

    it('ventana de 5 s: un evento repetido recién emitido no vuelve a insertarse', async () => {
        lastDup = { id: 'ev-1', created_at: new Date().toISOString() }
        const res = await POST(req({ stepKey: 'first_client', eventType: 'step_completed' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deduped: true })
        expect(inserts).toHaveLength(0)
    })

    it('guide_engagement NO pasa por la ventana (analítica de frecuencia)', async () => {
        lastDup = { id: 'ev-1', created_at: new Date().toISOString() }
        const res = await POST(req({ stepKey: 'profile_branding', eventType: 'guide_engagement' }))
        expect(res.status).toBe(200)
        expect(inserts).toHaveLength(1)
    })
})

describe('POST /api/coach/onboarding-events — bordes', () => {
    it('sin sesión → 401', async () => {
        authUser = null
        const res = await POST(req({ stepKey: 'aha', eventType: 'step_completed' }))
        expect(res.status).toBe(401)
        expect(inserts).toHaveLength(0)
    })

    it('rate limit → 429', async () => {
        rateLimitOk = false
        const res = await POST(req({ stepKey: 'aha', eventType: 'step_completed' }))
        expect(res.status).toBe(429)
        expect(inserts).toHaveLength(0)
    })

    it('body no-JSON → 400', async () => {
        const res = await POST(req('{no json'))
        expect(res.status).toBe(400)
        expect(inserts).toHaveLength(0)
    })
})
