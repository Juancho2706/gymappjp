import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `/api/mobile/coach/dashboard` — el bloque `onboardingV2` (W5) y la telemetría de la guía.
 *
 * Lo que este test pinnea:
 *  - el CONTRATO de `onboardingV2` que consume `apps/mobile/lib/coach-dashboard.ts`
 *    (persona · alsoOther · needsPersona · demoClientId · demoName · guide · signals);
 *  - que `guide` sale del MISMO parser que la web (`parseOnboardingGuide`), con `guide_seen_at`
 *    en snake_case tal como se escribe en el jsonb, y que el jsonb crudo sigue viajando entero en
 *    `onboardingGuide` (la app todavía lee de ahí `invite_code_confirmed` y el inventario del demo);
 *  - que `action: 'onboarding_event'` acepta los pasos de la guía v2. Con los 4 valores del
 *    checklist v1 que había antes, cualquier evento nuevo emitido desde la app moría en 400 y RN
 *    quedaba fuera de la medición.
 */

const COACH_ID = 'coach-uuid-mobile'

let bearerOk = true
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: async () => (bearerOk ? { ok: true, userId: COACH_ID, via: 'jose' } : { ok: false, status: 401 }),
}))

let coachRow: Record<string, unknown> | null = null
const inserts: Array<Record<string, unknown>> = []
let insertError: { message: string } | null = null

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: COACH_ID } }, error: null }) },
        from: (table: string) => {
            const chain: Record<string, unknown> = {}
            Object.assign(chain, {
                select: () => chain,
                update: () => chain,
                eq: async () => ({ error: null }),
                maybeSingle: async () => ({ data: coachRow, error: null }),
                insert: async (row: Record<string, unknown>) => {
                    inserts.push({ table, ...row })
                    return { error: insertError }
                },
            })
            // `update(...).eq(...)` se awaitea suelto; `select(...).eq(...).maybeSingle()` encadena.
            if (table === 'coaches') {
                Object.assign(chain, {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: coachRow, error: null }) }) }),
                })
            }
            return chain
        },
    }),
}))

vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
    resolveMobileCoachDataScope: async () => ({ type: 'standalone' }),
}))

vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: async () => ({ type: 'coach_standalone' }),
}))

vi.mock('@/app/coach/dashboard/_data/dashboard.queries', () => ({
    getCoachDashboardDataV2WithClient: async () => ({ kpis: {}, topRiskClients: [] }),
}))

const ONBOARDING_V2 = {
    persona: 'rehab',
    alsoOther: false,
    needsPersona: false,
    demoClientId: 'demo-1',
    demoName: 'Pedro',
    signals: {
        hasBrand: true,
        viveTuAppOpened: false,
        hasFirstArtifact: true,
        realClients: 2,
        realStudentActivity: false,
    },
}
const loadOnboardingV2ApiData = vi.fn(async (..._a: unknown[]) => ONBOARDING_V2 as unknown)
vi.mock('@/services/onboarding/onboarding-v2.queries', () => ({
    loadOnboardingV2ApiData: (...a: unknown[]) => loadOnboardingV2ApiData(...a),
}))

import { GET, POST } from './route'

function getReq() {
    return new NextRequest('http://localhost/api/mobile/coach/dashboard', {
        method: 'GET',
        headers: { authorization: 'Bearer ok' },
    })
}

function postReq(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/coach/dashboard', {
        method: 'POST',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    bearerOk = true
    inserts.length = 0
    insertError = null
    loadOnboardingV2ApiData.mockResolvedValue(ONBOARDING_V2)
    coachRow = {
        id: COACH_ID,
        full_name: 'Coach QA',
        brand_name: 'Studio QA',
        slug: 'studio-qa',
        invite_code: 'X5UD9X44',
        primary_color: '#1462DC',
        logo_url: null,
        subscription_status: 'active',
        subscription_tier: 'free',
        current_period_end: null,
        trial_ends_at: null,
        max_clients: 1,
        onboarding_guide: {
            completed: { profile_branding: true },
            dismissed: true,
            guide_seen_at: '2026-08-22T12:00:00.000Z',
            invite_code_confirmed: true,
        },
        persona: 'rehab',
        persona_also_other: false,
        theme_preset_key: null,
        created_at: '2026-08-22T10:00:00Z',
    }
})

describe('GET /api/mobile/coach/dashboard — bloque onboardingV2', () => {
    it('401 con token invalido', async () => {
        bearerOk = false
        const res = await GET(getReq())
        expect(res.status).toBe(401)
    })

    it('sirve el contrato completo que consume la app', async () => {
        const res = await GET(getReq())
        expect(res.status).toBe(200)
        const body = await res.json()

        expect(body.onboardingV2).toEqual({
            ...ONBOARDING_V2,
            guide: {
                completed: { profile_branding: true },
                dismissed: true,
                hidden: false,
                guideSeenAt: '2026-08-22T12:00:00.000Z',
            },
        })
        // El jsonb crudo NO se reemplaza: la app sigue leyendo de ahí lo que la guía no expone.
        expect(body.onboardingGuide.invite_code_confirmed).toBe(true)
    })

    it('el gate y las señales se calculan con la fila del coach del TOKEN', async () => {
        await GET(getReq())
        expect(loadOnboardingV2ApiData).toHaveBeenCalledWith(
            expect.anything(),
            COACH_ID,
            {
                persona: 'rehab',
                personaAlsoOther: false,
                coachCreatedAt: '2026-08-22T10:00:00Z',
                subscriptionStatus: 'active',
                workspaceType: 'coach_standalone',
            },
            { logo_url: null, theme_preset_key: null, primary_color: '#1462DC' },
        )
    })

    it('coach sin persona ni guia: el contrato sigue completo (nada undefined)', async () => {
        coachRow = { ...(coachRow as Record<string, unknown>), persona: null, persona_also_other: false, onboarding_guide: null }
        loadOnboardingV2ApiData.mockResolvedValue({
            persona: null,
            alsoOther: false,
            needsPersona: true,
            demoClientId: null,
            demoName: null,
            signals: {
                hasBrand: false,
                viveTuAppOpened: false,
                hasFirstArtifact: false,
                realClients: 0,
                realStudentActivity: false,
            },
        })
        const body = await (await GET(getReq())).json()
        expect(body.onboardingV2.needsPersona).toBe(true)
        expect(body.onboardingV2.guide).toEqual({
            completed: {},
            dismissed: false,
            hidden: false,
            guideSeenAt: null,
        })
    })
})

describe('POST /api/mobile/coach/dashboard — onboarding_event', () => {
    it('acepta los pasos de la guia v2', async () => {
        const res = await POST(postReq({ action: 'onboarding_event', stepKey: 'first_artifact', eventType: 'step_completed' }))
        expect(res.status).toBe(200)
        expect(inserts.at(-1)).toMatchObject({
            table: 'coach_onboarding_events',
            coach_id: COACH_ID,
            step_key: 'first_artifact',
            event_type: 'step_completed',
        })
    })

    it('acepta los tipos v2 (`vive_tu_app_opened`, `onboarding_dismissed`)', async () => {
        expect((await POST(postReq({ action: 'onboarding_event', stepKey: 'vive_tu_app', eventType: 'vive_tu_app_opened' }))).status).toBe(200)
        expect((await POST(postReq({ action: 'onboarding_event', stepKey: 'aha', eventType: 'onboarding_dismissed' }))).status).toBe(200)
    })

    it('sigue aceptando los pasos legacy del checklist v1', async () => {
        const res = await POST(postReq({ action: 'onboarding_event', stepKey: 'first_plan', eventType: 'step_completed' }))
        expect(res.status).toBe(200)
    })

    it('400 con un paso o un tipo que la DB no admite', async () => {
        expect((await POST(postReq({ action: 'onboarding_event', stepKey: 'inventado', eventType: 'step_completed' }))).status).toBe(400)
        expect((await POST(postReq({ action: 'onboarding_event', stepKey: 'aha', eventType: 'inventado' }))).status).toBe(400)
        expect(inserts).toHaveLength(0)
    })
})
