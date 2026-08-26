import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { TEMPLATE_CATALOG } from '@eva/onboarding'

/**
 * `/api/mobile/coach/templates` (W8) — el paso 3 template-first de la app.
 *
 * Lo que este test pinnea:
 *  - el GET devuelve las plantillas de la SUPERFICIE (no las de la persona a secas): la pauta de
 *    un coach de fuerza sigue siendo una pauta — el mismo `templatesForSurface` que usa la web, que
 *    acá corre DE VERDAD (solo se aísla el acceso a la base);
 *  - `days` sale del blueprint real, así que la sheet de RN no inventa el tamaño de la plantilla;
 *  - el POST no autoriza nada por su cuenta: token → workspace → allowlist del catálogo → el
 *    alumno tiene que ser alcanzable por ESTE coach, y recién entonces siembra;
 *  - un `templateId` inventado y un alumno ajeno mueren ANTES de `applyTemplate`.
 */

const COACH_ID = 'coach-uuid-mobile'
const CLIENT_ID = 'c0ffee00-dead-4bee-8000-000000000001'

let bearerOk = true
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: async () =>
        bearerOk ? { ok: true, userId: COACH_ID, via: 'jose' } : { ok: false, status: 401 },
}))

type CoachRow = { id: string; persona: string | null } | null
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

// `templatesForSurface` es PURO pero vive en un módulo que abre el cliente de servidor: se
// neutraliza la puerta a la base, no la lógica que se quiere pinnear.
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getClaims: async () => ({ data: null }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    }),
}))

const applyTemplate = vi.fn(async (..._a: unknown[]) => ({ ok: true, programId: 'prog-1' }) as unknown)
vi.mock('@/services/onboarding/demo-student.service', () => ({
    applyTemplate: (...a: unknown[]) => applyTemplate(...a),
    getDemoClientId: async () => null,
}))

let mutationCtx: unknown = null
let ownsClient = true
vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: async () => mutationCtx,
    mobileContextOwnsClient: async () => ownsClient,
}))

import { GET, POST } from './route'

function getReq(query = '', auth = 'Bearer ok') {
    return new NextRequest(`http://localhost/api/mobile/coach/templates${query}`, {
        method: 'GET',
        headers: auth ? { authorization: auth } : {},
    })
}

function postReq(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/coach/templates', {
        method: 'POST',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

/**
 * Clientes de Supabase de mentira, encadenables (mismo patrón que `persona/route.test.ts`).
 *
 * Hoy el POST no los usa para leer: `mobileContextOwnsClient` y `applyTemplate` están mockeados
 * arriba, así que la propiedad del alumno la sigue decidiendo el switch `ownsClient` y no esta
 * fake DB. Están encadenados igual para que el día que la ruta lea de verdad —la cadena real es
 * `clients`/`coach_client_assignments` con `select().eq().is().maybeSingle()`— el test falle por
 * la aserción y no con un `db.from is not a function`.
 *
 * Devuelven el VACÍO seguro: sin filas y sin error.
 */
function fakeDbClient<T extends object>(marker: T): T {
    return {
        ...marker,
        from: () => {
            const chain: Record<string, unknown> = {}
            Object.assign(chain, {
                select: () => chain,
                insert: () => chain,
                update: () => chain,
                delete: () => chain,
                eq: () => chain,
                is: () => chain,
                or: () => chain,
                gt: () => chain,
                gte: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
                // Query sin `maybeSingle` (conteos, listados, INSERT/UPDATE): cero filas y sin error.
                then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null, count: 0 }),
            })
            return chain
        },
    } as unknown as T
}

const ADMIN = fakeDbClient({ admin: true })
const USER_DB = fakeDbClient({ userDb: true })

beforeEach(() => {
    vi.clearAllMocks()
    bearerOk = true
    coachError = null
    ownsClient = true
    coachRow = { id: COACH_ID, persona: 'strength' }
    applyTemplate.mockResolvedValue({ ok: true, programId: 'prog-1' })
    mutationCtx = { admin: ADMIN, userDb: USER_DB, userId: COACH_ID, scope: { type: 'standalone' } }
})

describe('GET /api/mobile/coach/templates', () => {
    it('401 sin Authorization: Bearer', async () => {
        const res = await GET(getReq('', ''))
        expect(res.status).toBe(401)
        expect((await res.json()).code).toBe('MISSING_TOKEN')
    })

    it('401 con token invalido', async () => {
        bearerOk = false
        const res = await GET(getReq())
        expect((await res.json()).code).toBe('INVALID_TOKEN')
    })

    it('404 cuando el usuario del token no tiene fila de coach', async () => {
        coachRow = null
        const res = await GET(getReq())
        expect(res.status).toBe(404)
        expect((await res.json()).code).toBe('COACH_NOT_FOUND')
    })

    it('sin superficie: entrenamiento de la persona del coach', async () => {
        const body = await (await GET(getReq())).json()
        expect(body.persona).toBe('strength')
        expect(body.surface).toBe('training')
        expect(body.templates.map((t: { id: string }) => t.id)).toEqual(
            TEMPLATE_CATALOG.strength.map((t) => t.id),
        )
    })

    it('la superficie manda sobre la persona: un coach de fuerza pide pautas y recibe nutricion', async () => {
        const body = await (await GET(getReq('?surface=nutrition'))).json()
        expect(body.templates.map((t: { id: string }) => t.id)).toEqual(
            TEMPLATE_CATALOG.nutrition.map((t) => t.id),
        )
    })

    it('movimiento y cardio salen de su rama, no de la del coach', async () => {
        const movement = await (await GET(getReq('?surface=movement'))).json()
        const cardio = await (await GET(getReq('?surface=cardio'))).json()
        expect(movement.templates.map((t: { id: string }) => t.id)).toEqual(
            TEMPLATE_CATALOG.rehab.map((t) => t.id),
        )
        expect(cardio.templates.map((t: { id: string }) => t.id)).toEqual(
            TEMPLATE_CATALOG.endurance.map((t) => t.id),
        )
    })

    it('una superficie inventada cae en entrenamiento en vez de devolver vacio', async () => {
        const body = await (await GET(getReq('?surface=marte'))).json()
        expect(body.surface).toBe('training')
        expect(body.templates.length).toBeGreaterThan(0)
    })

    it('coach sin persona: entrenamiento generico y persona null', async () => {
        coachRow = { id: COACH_ID, persona: null }
        const body = await (await GET(getReq())).json()
        expect(body.persona).toBeNull()
        expect(body.templates.length).toBeGreaterThan(0)
    })

    it('cada plantilla viaja con su tamano real y su tipo (la sheet no lo inventa)', async () => {
        const training = await (await GET(getReq())).json()
        const fullBody = training.templates.find((t: { id: string }) => t.id === 'full-body-3')
        expect(fullBody.kind).toBe('program')
        expect(fullBody.days).toBe(3)

        const nutrition = await (await GET(getReq('?surface=nutrition'))).json()
        for (const template of nutrition.templates) {
            expect(template.kind).toBe('nutrition')
            expect(template.days).toBeGreaterThan(0)
        }
    })
})

describe('POST /api/mobile/coach/templates', () => {
    it('propaga el rechazo de autenticacion del helper de mutaciones', async () => {
        mutationCtx = { error: new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 }) }
        const res = await POST(postReq({ templateId: 'full-body-3', clientId: CLIENT_ID }))
        expect(res.status).toBe(401)
        expect(applyTemplate).not.toHaveBeenCalled()
    })

    it('400 con body invalido, sin sembrar', async () => {
        const res = await POST(postReq({ templateId: '', clientId: 'no-es-uuid' }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('INVALID_TEMPLATE_INPUT')
        expect(applyTemplate).not.toHaveBeenCalled()
    })

    it('400 con una plantilla fuera del catalogo, sin sembrar', async () => {
        const res = await POST(postReq({ templateId: 'rutina-magica', clientId: CLIENT_ID }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('TEMPLATE_UNKNOWN')
        expect(applyTemplate).not.toHaveBeenCalled()
    })

    it('403 cuando el alumno no es alcanzable por este coach, sin sembrar', async () => {
        ownsClient = false
        const res = await POST(postReq({ templateId: 'full-body-3', clientId: CLIENT_ID }))
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('CLIENT_NOT_ALLOWED')
        expect(applyTemplate).not.toHaveBeenCalled()
    })

    it('siembra con el coachId del TOKEN y devuelve el programa creado', async () => {
        const res = await POST(postReq({ templateId: 'full-body-3', clientId: CLIENT_ID }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, programId: 'prog-1', planId: null })
        expect(applyTemplate).toHaveBeenCalledWith(ADMIN, {
            coachId: COACH_ID,
            clientId: CLIENT_ID,
            templateId: 'full-body-3',
        })
    })

    it('una pauta devuelve planId', async () => {
        applyTemplate.mockResolvedValue({ ok: true, planId: 'plan-9' })
        const res = await POST(postReq({ templateId: 'portions-1800', clientId: CLIENT_ID }))
        expect(await res.json()).toEqual({ ok: true, programId: null, planId: 'plan-9' })
    })

    it('501 cuando la plantilla existe en el catalogo pero no tiene contenido', async () => {
        applyTemplate.mockResolvedValue({ ok: false, reason: 'not_implemented' })
        const res = await POST(postReq({ templateId: 'full-body-3', clientId: CLIENT_ID }))
        expect(res.status).toBe(501)
        expect((await res.json()).code).toBe('TEMPLATE_NOT_IMPLEMENTED')
    })

    it('500 cuando el sembrado falla (el detalle viaja para poder diagnosticar)', async () => {
        applyTemplate.mockResolvedValue({ ok: false, reason: 'error', detail: 'workout_programs: boom' })
        const res = await POST(postReq({ templateId: 'full-body-3', clientId: CLIENT_ID }))
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'workout_programs: boom', code: 'TEMPLATE_APPLY_FAILED' })
    })
})
