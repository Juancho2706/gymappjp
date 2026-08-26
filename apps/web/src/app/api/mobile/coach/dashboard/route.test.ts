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
 *    quedaba fuera de la medición;
 *  - que `vive_tu_app_entered` NO entra por acá (vive-tu-app-directo V1.15): lo escribe SOLO el
 *    servidor web tras verificar el magic link;
 *  - el espejo a PostHog del insert directo (W8.5.2 = W0.5 de flujo-coach-nuevo): sale tras el
 *    insert OK y nunca con el insert rechazado.
 */

const COACH_ID = 'coach-uuid-mobile'

let bearerOk = true
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: async () => (bearerOk ? { ok: true, userId: COACH_ID, via: 'jose' } : { ok: false, status: 401 }),
}))

let coachRow: Record<string, unknown> | null = null
const inserts: Array<Record<string, unknown>> = []
let insertError: { code?: string; message: string } | null = null

/** El espejo a PostHog se ejercita con el módulo real: lo mockeado es la ingesta. */
type CaptureInput = {
    event: string
    distinctId: string
    properties?: Record<string, string | number | boolean | null>
    set?: Record<string, string | number | boolean | null>
}
const captureMock = vi.hoisted(() => vi.fn<(input: CaptureInput) => Promise<void>>(async () => {}))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))

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
        logo_url_dark: null,
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

describe('GET /api/mobile/coach/dashboard — logo del coach', () => {
    it('manda las URLs del logo (claro + oscuro) junto al hasCoachLogo de siempre', async () => {
        coachRow = {
            ...(coachRow as Record<string, unknown>),
            logo_url: '  https://cdn.eva/logo-claro.png  ',
            logo_url_dark: 'https://cdn.eva/logo-oscuro.png',
        }
        const body = await (await GET(getReq())).json()
        expect(body.coach.hasCoachLogo).toBe(true)
        expect(body.coach.logoUrl).toBe('https://cdn.eva/logo-claro.png')
        expect(body.coach.logoUrlDark).toBe('https://cdn.eva/logo-oscuro.png')
    })

    it('sin logo oscuro manda null (la app cae al claro), no undefined', async () => {
        coachRow = { ...(coachRow as Record<string, unknown>), logo_url: 'https://cdn.eva/logo.png', logo_url_dark: null }
        const body = await (await GET(getReq())).json()
        expect(body.coach.logoUrl).toBe('https://cdn.eva/logo.png')
        expect(body.coach.logoUrlDark).toBeNull()
    })

    it('sin logo: las dos URLs son null y hasCoachLogo sigue en false', async () => {
        const body = await (await GET(getReq())).json()
        expect(body.coach).toMatchObject({ hasCoachLogo: false, logoUrl: null, logoUrlDark: null })
    })

    it('tier sin white-label (starter legacy): URLs gateadas, hasCoachLogo intacto', async () => {
        coachRow = {
            ...(coachRow as Record<string, unknown>),
            subscription_tier: 'starter',
            logo_url: 'https://cdn.eva/logo.png',
            logo_url_dark: 'https://cdn.eva/logo-oscuro.png',
        }
        const body = await (await GET(getReq())).json()
        expect(body.coach.subscriptionTier).toBe('starter')
        // El booleano es contrato viejo y NO cambia de semántica; lo que se gatea es la URL.
        expect(body.coach.hasCoachLogo).toBe(true)
        expect(body.coach.logoUrl).toBeNull()
        expect(body.coach.logoUrlDark).toBeNull()
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

    it('`vive_tu_app_entered` desde la app → 400 (la lista de 12 aceptados no cambia)', async () => {
        // vive-tu-app-directo V1.15: el evento existe en la base desde V1.11, pero lo escribe SOLO
        // el servidor web (`GET /vive-tu-app`, después de verificar el magic link y el cinturón
        // `is_demo`). Abrirlo acá dejaría a cualquiera con un bearer auto-tildarse el paso 2 — que
        // es exactamente la mentira que esa spec vino a arreglar. La unión de tipos de
        // `apps/mobile/lib/coach-dashboard.ts` tampoco lo incluye (V1.25).
        const res = await POST(
            postReq({ action: 'onboarding_event', stepKey: 'vive_tu_app', eventType: 'vive_tu_app_entered' })
        )
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'INVALID_EVENT' })
        expect(inserts).toHaveLength(0)
    })
})

describe('POST /api/mobile/coach/dashboard — espejo a PostHog', () => {
    it('tras el insert OK espeja el evento con el coach del token como distinct_id', async () => {
        const res = await POST(
            postReq({
                action: 'onboarding_event',
                stepKey: 'first_artifact',
                eventType: 'step_completed',
                metadata: { persona: 'rehab', surface: 'rn' },
            })
        )

        expect(res.status).toBe(200)
        expect(captureMock).toHaveBeenCalledTimes(1)
        expect(captureMock).toHaveBeenCalledWith({
            event: 'step_completed',
            distinctId: COACH_ID,
            properties: { persona: 'rehab', surface: 'rn', step_key: 'first_artifact' },
            set: { persona: 'rehab' },
        })
    })

    it('sin `persona` en el metadata se espeja igual, pero sin `$set`', async () => {
        await POST(postReq({ action: 'onboarding_event', stepKey: 'aha', eventType: 'aha_moment' }))
        expect(captureMock).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'aha_moment', properties: { step_key: 'aha' }, set: undefined })
        )
    })

    it('insert rechazado (duplicado o FK rota) → 500 y sin espejo', async () => {
        insertError = { code: '23503', message: 'insert or update violates foreign key constraint' }
        const res = await POST(
            postReq({ action: 'onboarding_event', stepKey: 'first_artifact', eventType: 'step_completed' })
        )
        expect(res.status).toBe(500)
        expect(captureMock).not.toHaveBeenCalled()
    })

    it('evento rechazado con 400: ni fila ni espejo', async () => {
        await POST(postReq({ action: 'onboarding_event', stepKey: 'aha', eventType: 'inventado' }))
        expect(inserts).toHaveLength(0)
        expect(captureMock).not.toHaveBeenCalled()
    })

    it('`persona_selected` NO se espeja: su call site ya lo captura con payload propio', async () => {
        const res = await POST(
            postReq({
                action: 'onboarding_event',
                stepKey: 'persona',
                eventType: 'persona_selected',
                metadata: { persona: 'nutrition' },
            })
        )
        expect(res.status).toBe(200)
        expect(inserts).toHaveLength(1)
        expect(captureMock).not.toHaveBeenCalled()
    })

    it('la captura que explota no cambia la respuesta del endpoint', async () => {
        captureMock.mockRejectedValueOnce(new Error('posthog caído'))
        const res = await POST(
            postReq({ action: 'onboarding_event', stepKey: 'first_artifact', eventType: 'step_completed' })
        )
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
    })
})
