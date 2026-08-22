import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `/api/mobile/coach/demo-student` — el alumno de ejemplo desde la app.
 *
 * DELETE lo usa la guía de RN («Borrar ejemplo», W5 F5.2); POST lo usa «Opciones › Mi panel»
 * («Volver a sembrar el alumno de ejemplo», W8.2.2).
 *
 * Lo que este test pinnea:
 *  - el `coachId` sale SIEMPRE del contexto de autenticación, nunca del body (que acá ni se lee);
 *  - un coach administrado por team/org no siembra ni borra nada desde el teléfono;
 *  - la PERSONA sale de la base, no del request — y `other` (sin alumno de ejemplo) se responde
 *    con el motivo humano, no con un 500;
 *  - el sembrado corre con el cliente ADMIN (`clients.is_demo` la escribe solo `service_role`);
 *  - el evento del funnel es best-effort y no cambia la respuesta.
 */

const COACH_ID = 'coach-uuid-mobile'

const deleteDemoStudent = vi.fn(async (..._a: unknown[]) => ({ ok: true, deleted: true }) as unknown)
const seedDemoStudent = vi.fn(
    async (..._a: unknown[]) => ({ ok: true, demoClientId: 'demo-1', alreadyExisted: false }) as unknown,
)
vi.mock('@/services/onboarding/demo-student.service', () => ({
    deleteDemoStudent: (...a: unknown[]) => deleteDemoStudent(...a),
    seedDemoStudent: (...a: unknown[]) => seedDemoStudent(...a),
}))

const recordOnboardingEvent = vi.fn(async (..._a: unknown[]) => undefined)
const readCoachPersona = vi.fn(async (..._a: unknown[]) => ({
    persona: 'strength' as string | null,
    alsoOther: false,
    personaSetAt: null as string | null,
}))
vi.mock('@/services/coach/persona.service', () => ({
    recordOnboardingEvent: (...a: unknown[]) => recordOnboardingEvent(...a),
    readCoachPersona: (...a: unknown[]) => readCoachPersona(...a),
}))

let mutationCtx: unknown = null
vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: async () => mutationCtx,
}))

import { DELETE, POST } from './route'

const ADMIN = { admin: true }
const USER_DB = { userDb: true }

function req(method: 'DELETE' | 'POST') {
    return new NextRequest('http://localhost/api/mobile/coach/demo-student', {
        method,
        headers: { authorization: 'Bearer ok' },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'standalone' } }
    deleteDemoStudent.mockResolvedValue({ ok: true, deleted: true })
    seedDemoStudent.mockResolvedValue({ ok: true, demoClientId: 'demo-1', alreadyExisted: false })
    readCoachPersona.mockResolvedValue({ persona: 'strength', alsoOther: false, personaSetAt: null })
})

describe('DELETE /api/mobile/coach/demo-student', () => {
    it('propaga el rechazo de autenticacion del helper de mutaciones', async () => {
        mutationCtx = { error: new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 }) }
        const res = await DELETE(req('DELETE'))
        expect(res.status).toBe(401)
        expect(deleteDemoStudent).not.toHaveBeenCalled()
    })

    it('403 para un coach administrado por org/team', async () => {
        mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'team', teamId: 't-1' } }
        const res = await DELETE(req('DELETE'))
        expect(res.status).toBe(403)
        expect(deleteDemoStudent).not.toHaveBeenCalled()
    })

    it('borra con el cliente ADMIN y el coachId del contexto', async () => {
        const res = await DELETE(req('DELETE'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deleted: true })
        expect(deleteDemoStudent).toHaveBeenCalledWith(ADMIN, { coachId: COACH_ID })
    })
})

describe('POST /api/mobile/coach/demo-student (re-sembrado)', () => {
    it('propaga el rechazo de autenticacion del helper de mutaciones', async () => {
        mutationCtx = { error: new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 }) }
        const res = await POST(req('POST'))
        expect(res.status).toBe(401)
        expect(seedDemoStudent).not.toHaveBeenCalled()
    })

    it('403 para un coach administrado por org/team', async () => {
        mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'enterprise', orgId: 'o-1' } }
        const res = await POST(req('POST'))
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('WORKSPACE_ACTION_NOT_ALLOWED')
        expect(seedDemoStudent).not.toHaveBeenCalled()
    })

    it('409 cuando el coach todavia no eligio especialidad', async () => {
        readCoachPersona.mockResolvedValue({ persona: null, alsoOther: false, personaSetAt: null })
        const res = await POST(req('POST'))
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: 'Primero elige tu especialidad.', code: 'PERSONA_MISSING' })
        expect(seedDemoStudent).not.toHaveBeenCalled()
    })

    it('409 cuando la persona no trae alumno de ejemplo (`other`)', async () => {
        readCoachPersona.mockResolvedValue({ persona: 'other', alsoOther: false, personaSetAt: null })
        const res = await POST(req('POST'))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('PERSONA_WITHOUT_DEMO')
        expect(seedDemoStudent).not.toHaveBeenCalled()
    })

    it('siembra con el ADMIN, la persona de la BASE y el coachId del contexto', async () => {
        const res = await POST(req('POST'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            ok: true,
            demoClientId: 'demo-1',
            demoName: 'Matías',
            alreadyExisted: false,
        })
        expect(readCoachPersona).toHaveBeenCalledWith(USER_DB, COACH_ID)
        expect(seedDemoStudent).toHaveBeenCalledWith(ADMIN, { coachId: COACH_ID, persona: 'strength' })
    })

    it('idempotente: si el demo ya existia lo dice sin crear otro', async () => {
        seedDemoStudent.mockResolvedValue({ ok: true, demoClientId: 'demo-1', alreadyExisted: true })
        const res = await POST(req('POST'))
        expect(await res.json()).toMatchObject({ ok: true, alreadyExisted: true })
    })

    it('emite `demo_seeded` con surface rn y source mi_panel', async () => {
        await POST(req('POST'))
        expect(recordOnboardingEvent).toHaveBeenCalledWith(ADMIN, {
            coachId: COACH_ID,
            eventType: 'demo_seeded',
            metadata: {
                persona: 'strength',
                demoClientId: 'demo-1',
                alreadyExisted: false,
                surface: 'rn',
                source: 'mi_panel',
            },
        })
    })

    it('503 cuando el sembrador todavia no esta disponible', async () => {
        seedDemoStudent.mockResolvedValue({ ok: false, reason: 'not_implemented' })
        const res = await POST(req('POST'))
        expect(res.status).toBe(503)
        expect((await res.json()).code).toBe('DEMO_NOT_AVAILABLE')
    })

    it('500 con mensaje humano cuando el sembrado falla de verdad', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        seedDemoStudent.mockResolvedValue({ ok: false, reason: 'error', detail: 'auth.createUser: boom' })
        const res = await POST(req('POST'))
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({
            error: 'No pudimos crear el alumno de ejemplo. Inténtalo de nuevo.',
            code: 'DEMO_SEED_FAILED',
        })
    })
})
