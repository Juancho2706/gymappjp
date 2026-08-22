import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `/api/mobile/coach/persona` (W5 F5.1) — el gate del primer ingreso de la app y la escritura de
 * la respuesta.
 *
 * Lo que este test pinnea:
 *  - el GET decide `needsPersona` con los MISMOS resolvers que el proxy web (D8: persona nula +
 *    no managed + (coach nuevo || 0 alumnos reales)), no con una regla propia de RN;
 *  - un conteo de alumnos caído NO manda a un coach con cartera a la pantalla (fail-open);
 *  - el POST delega en `applyCoachPersona` (el núcleo compartido con el server action web) con el
 *    `coachId` del TOKEN y `surface: 'rn'`, y rechaza a los coaches administrados por org/team;
 *  - el body nunca es autoridad: una persona fuera del contrato muere en 400 sin escribir.
 */

const COACH_ID = 'coach-uuid-mobile'
/** Después del corte de onboarding v2 (`PERSONA_GATE_LAUNCH_ISO`). */
const NEW_COACH_CREATED_AT = '2026-08-22T10:00:00Z'
const OLD_COACH_CREATED_AT = '2026-05-01T10:00:00Z'

let bearerOk = true
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: async () => (bearerOk ? { ok: true, userId: COACH_ID, via: 'jose' } : { ok: false, status: 401 }),
}))

type CoachRow = {
    id: string
    persona: string | null
    persona_also_other: boolean
    subscription_status: string | null
    created_at: string | null
} | null

let coachRow: CoachRow = null
let coachError: { message: string } | null = null

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        from: (table: string) => {
            if (table !== 'coaches') throw new Error(`Unexpected table: ${table}`)
            const chain: Record<string, unknown> = {}
            Object.assign(chain, {
                select: () => chain,
                eq: () => chain,
                maybeSingle: async () => ({ data: coachRow, error: coachError }),
            })
            return chain
        },
    }),
}))

let workspaceType: string | null = 'coach_standalone'
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: async () => (workspaceType ? { type: workspaceType } : null),
}))

let realClients = 0
let clientCountThrows = false
vi.mock('@/services/billing/capacity.service', () => ({
    countActiveStandaloneClients: async () => {
        if (clientCountThrows) throw new Error('db caida')
        return realClients
    },
}))

const applyCoachPersona = vi.fn(async (..._a: unknown[]) => ({ ok: true, demoClientId: 'demo-1' }) as unknown)
vi.mock('@/services/coach/persona.service', async (importOriginal) => ({
    // Los resolvers PUROS del gate se usan de verdad: lo que se aísla es la escritura.
    ...(await importOriginal<typeof import('@/services/coach/persona.service')>()),
    applyCoachPersona: (...a: unknown[]) => applyCoachPersona(...a),
}))

let mutationCtx: unknown = null
vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: async () => mutationCtx,
}))

import { GET, POST } from './route'

function getReq(auth = 'Bearer ok') {
    return new NextRequest('http://localhost/api/mobile/coach/persona', {
        method: 'GET',
        headers: auth ? { authorization: auth } : {},
    })
}

function postReq(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/coach/persona', {
        method: 'POST',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

const ADMIN = { admin: true }
const USER_DB = { userDb: true }

beforeEach(() => {
    vi.clearAllMocks()
    bearerOk = true
    coachError = null
    workspaceType = 'coach_standalone'
    realClients = 0
    clientCountThrows = false
    coachRow = {
        id: COACH_ID,
        persona: null,
        persona_also_other: false,
        subscription_status: 'active',
        created_at: NEW_COACH_CREATED_AT,
    }
    applyCoachPersona.mockResolvedValue({ ok: true, demoClientId: 'demo-1' })
    mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'standalone' } }
})

describe('GET /api/mobile/coach/persona', () => {
    it('401 sin Authorization: Bearer', async () => {
        const res = await GET(getReq(''))
        expect(res.status).toBe(401)
        expect((await res.json()).code).toBe('MISSING_TOKEN')
    })

    it('401 con token invalido', async () => {
        bearerOk = false
        const res = await GET(getReq())
        expect(res.status).toBe(401)
        expect((await res.json()).code).toBe('INVALID_TOKEN')
    })

    it('404 cuando el usuario del token no tiene fila de coach', async () => {
        coachRow = null
        const res = await GET(getReq())
        expect(res.status).toBe(404)
        expect((await res.json()).code).toBe('COACH_NOT_FOUND')
    })

    it('coach nuevo sin persona: needsPersona true', async () => {
        const res = await GET(getReq())
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ persona: null, alsoOther: false, needsPersona: true })
    })

    it('coach que ya contesto: needsPersona false y devuelve su respuesta', async () => {
        coachRow = {
            id: COACH_ID,
            persona: 'nutrition',
            persona_also_other: true,
            subscription_status: 'active',
            created_at: NEW_COACH_CREATED_AT,
        }
        const res = await GET(getReq())
        expect(await res.json()).toEqual({ persona: 'nutrition', alsoOther: true, needsPersona: false })
    })

    it('coach VIEJO con alumnos reales: no se le pregunta (lo invita la pildora)', async () => {
        coachRow = {
            id: COACH_ID,
            persona: null,
            persona_also_other: false,
            subscription_status: 'active',
            created_at: OLD_COACH_CREATED_AT,
        }
        realClients = 3
        const res = await GET(getReq())
        expect(await res.json()).toEqual({ persona: null, alsoOther: false, needsPersona: false })
    })

    it('coach VIEJO sin alumnos reales: si se le pregunta', async () => {
        coachRow = {
            id: COACH_ID,
            persona: null,
            persona_also_other: false,
            subscription_status: 'active',
            created_at: OLD_COACH_CREATED_AT,
        }
        realClients = 0
        const res = await GET(getReq())
        expect((await res.json()).needsPersona).toBe(true)
    })

    it('conteo de alumnos caido en un coach viejo: fail-open, no se secuestra el panel', async () => {
        coachRow = {
            id: COACH_ID,
            persona: null,
            persona_also_other: false,
            subscription_status: 'active',
            created_at: OLD_COACH_CREATED_AT,
        }
        clientCountThrows = true
        const res = await GET(getReq())
        expect((await res.json()).needsPersona).toBe(false)
    })

    it('coach administrado por una org: nunca se le pregunta', async () => {
        workspaceType = 'enterprise_coach'
        const res = await GET(getReq())
        expect((await res.json()).needsPersona).toBe(false)
    })
})

describe('POST /api/mobile/coach/persona', () => {
    it('propaga el rechazo de autenticacion del helper de mutaciones', async () => {
        mutationCtx = { error: new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 }) }
        const res = await POST(postReq({ persona: 'strength' }))
        expect(res.status).toBe(401)
        expect(applyCoachPersona).not.toHaveBeenCalled()
    })

    it('403 para un coach administrado por org/team', async () => {
        mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'enterprise', orgId: 'org-1' } }
        const res = await POST(postReq({ persona: 'strength' }))
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('WORKSPACE_ACTION_NOT_ALLOWED')
        expect(applyCoachPersona).not.toHaveBeenCalled()
    })

    it('400 con una persona fuera del contrato, sin escribir', async () => {
        const res = await POST(postReq({ persona: 'crossfit' }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('INVALID_PERSONA')
        expect(applyCoachPersona).not.toHaveBeenCalled()
    })

    it('400 con body vacio', async () => {
        const res = await POST(
            new NextRequest('http://localhost/api/mobile/coach/persona', {
                method: 'POST',
                headers: { authorization: 'Bearer ok' },
            }),
        )
        expect(res.status).toBe(400)
        expect(applyCoachPersona).not.toHaveBeenCalled()
    })

    it('delega en el nucleo compartido con el coachId del TOKEN y surface rn', async () => {
        const res = await POST(postReq({ persona: 'endurance', alsoOther: true }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, demoClientId: 'demo-1' })
        expect(applyCoachPersona).toHaveBeenCalledWith({
            supabase: USER_DB,
            admin: ADMIN,
            coachId: COACH_ID,
            persona: 'endurance',
            alsoOther: true,
            surface: 'rn',
        })
    })

    it('`alsoOther` ausente vale «No»', async () => {
        await POST(postReq({ persona: 'rehab' }))
        expect(applyCoachPersona).toHaveBeenCalledWith(expect.objectContaining({ alsoOther: false }))
    })

    it('500 cuando el nucleo no pudo guardar (el mensaje viaja tal cual)', async () => {
        applyCoachPersona.mockResolvedValue({ ok: false, error: 'No pudimos guardar tu elección. Inténtalo de nuevo.' })
        const res = await POST(postReq({ persona: 'strength' }))
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({
            error: 'No pudimos guardar tu elección. Inténtalo de nuevo.',
            code: 'PERSONA_SAVE_FAILED',
        })
    })
})
