import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Proxy — las tres piezas que «Vive tu app» le agrega (docs/specs/vive-tu-app-directo §3).
 *
 * 1. `/vive-tu-app` y `/volver-al-panel` salen ANTES de que el proxy cree su cliente de Supabase:
 *    esas dos rutas cambian de identidad a mitad del request y el `setAll` del proxy reescribiría
 *    la respuesta con la sesión de quien venía en las cookies. Mismo nombre de cookie, gana el
 *    último `Set-Cookie` — y el coach termina logueado como quien no debía.
 * 2. Una sesión con fila en `clients` que pide `/coach/*` vuelve a SU app. Antes caía en
 *    `/coach/onboarding/complete`, cuyo formulario inserta un `coaches` SOBRE el usuario demo.
 * 3. Los headers del banner de la vista de ejemplo se setean SIEMPRE en la rama `/c` (vacíos
 *    cuando no aplica): el proxy copia los headers del request, así que uno condicional lo podría
 *    falsificar el visitante mandándolo a mano.
 */

const getUser = vi.fn()
const rateLimitAuth = vi.fn()

/** Filas por tabla para el cliente de sesión (RLS) y para el admin. */
let sessionRows: Record<string, unknown> = {}
let adminRows: Record<string, unknown> = {}
let coachBrandingRow: unknown = null

function fakeDb(rows: Record<string, unknown>) {
    return {
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
                    is: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }),
                }),
            }),
        }),
        rpc: async () => ({ data: null, error: null }),
        auth: { getUser },
    }
}

vi.mock('@supabase/ssr', () => ({
    createServerClient: vi.fn(() => fakeDb(sessionRows)),
}))

// Cliente anonimo del branding /c: desde SEC-01 fase 2 el proxy lo consulta por el RPC
// `get_coach_public_branding` (una fila por slug-o-codigo), no por `from('coaches')`.
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        rpc: async () => ({ data: coachBrandingRow, error: null }),
    })),
}))

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeDb(adminRows)),
}))

vi.mock('@/lib/rate-limit', () => ({
    clientIpFromRequest: () => '1.2.3.4',
    jsonRateLimited: () => new Response('{}', { status: 429 }),
    rateLimitAuth: (...args: unknown[]) => rateLimitAuth(...args),
    rateLimitSignup: async () => ({ ok: true }),
    rateLimitPayment: async () => ({ ok: true }),
    rateLimitAdmin: async () => ({ ok: true }),
}))

vi.mock('@/lib/student-access.server', () => ({
    isStudentAccessGateEnabled: async () => false,
    resolveStudentAccessForCoach: async () => null,
}))

vi.mock('@/services/auth/workspace.service', () => ({
    listUserWorkspaces: async () => [],
    pickPreferredWorkspace: () => null,
}))

vi.mock('@/infrastructure/db/workspace.repository', () => ({
    findWorkspacePreference: async () => null,
}))

import { proxy } from './proxy'
import { createServerClient } from '@supabase/ssr'

const COACH_ROW = {
    id: 'coach-1',
    brand_name: 'Studio Fuerza',
    primary_color: '#1462DC',
    logo_url: null,
    slug: 'studio-fuerza-qa',
    subscription_tier: 'free',
    executor_theme: 'coach',
}

const DEMO_CLIENT = {
    id: 'demo-1',
    coach_id: 'coach-1',
    org_id: null,
    team_id: null,
    force_password_change: false,
    onboarding_completed: true,
    is_active: true,
    is_archived: false,
    is_demo: true,
    full_name: 'Matías Soto',
}

function req(path: string, init?: { method?: string; cookie?: string }) {
    return new NextRequest(`https://www.eva-app.cl${path}`, {
        method: init?.method ?? 'GET',
        headers: init?.cookie ? { cookie: init.cookie } : undefined,
    })
}

describe('proxy — «Vive tu app»', () => {
    beforeEach(() => {
        getUser.mockReset()
        rateLimitAuth.mockReset()
        rateLimitAuth.mockResolvedValue({ ok: true })
        vi.mocked(createServerClient).mockClear()
        sessionRows = {}
        adminRows = {}
        coachBrandingRow = COACH_ROW
        getUser.mockResolvedValue({ data: { user: null } })
    })

    describe('V2.1 — el proxy no toca las dos rutas del viaje', () => {
        it('`/vive-tu-app` pasa sin crear cliente de Supabase ni escribir cookies', async () => {
            const res = await proxy(req('/vive-tu-app?t=tok&c=X5UD9'))
            expect(createServerClient).not.toHaveBeenCalled()
            expect(res.headers.get('set-cookie')).toBeNull()
        })

        it('`POST /volver-al-panel` pasa sin crear cliente de Supabase ni escribir cookies', async () => {
            const res = await proxy(req('/volver-al-panel', { method: 'POST' }))
            expect(rateLimitAuth).toHaveBeenCalledWith('1.2.3.4')
            expect(createServerClient).not.toHaveBeenCalled()
            expect(res.headers.get('set-cookie')).toBeNull()
        })

        it('`POST /volver-al-panel` throttleado → 303 al login de coach, nunca el JSON del 429', async () => {
            rateLimitAuth.mockResolvedValue({ ok: false, retryAfter: 30 })

            const res = await proxy(req('/volver-al-panel', { method: 'POST' }))

            expect(res.status).toBe(303)
            expect(res.headers.get('location')).toBe('https://www.eva-app.cl/login?error=vive_tu_app_volver')
        })
    })

    describe('V2.2 — con sesión de alumno, el árbol del coach no existe', () => {
        it('la sesión del demo pidiendo `/coach/guia` vuelve a su app, nunca al alta de coach', async () => {
            getUser.mockResolvedValue({ data: { user: { id: 'demo-1' } } })
            sessionRows = { coaches: null }
            adminRows = {
                clients: { id: 'demo-1', coach_id: 'coach-1', is_demo: true },
                coaches: { id: 'coach-1', slug: 'studio-fuerza-qa', invite_code: 'X5UD9' },
            }

            const res = await proxy(req('/coach/guia'))

            expect(res.status).toBe(303)
            expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9/dashboard')
        })

        it('un usuario sin fila en `clients` sigue yendo al alta OAuth (sin regresión)', async () => {
            getUser.mockResolvedValue({ data: { user: { id: 'nuevo-1' } } })
            sessionRows = { coaches: null }
            adminRows = { clients: null }

            const res = await proxy(req('/coach/dashboard'))

            expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/onboarding/complete')
        })
    })

    describe('V2.3 — headers del banner en la rama `/c`', () => {
        it('sesión demo → is-demo, nombre codificado y modo desde la cookie', async () => {
            getUser.mockResolvedValue({ data: { user: { id: 'demo-1' } } })
            sessionRows = { clients: DEMO_CLIENT }

            const res = await proxy(req('/c/studio-fuerza-qa/dashboard', { cookie: 'eva_vta_mode=return' }))

            expect(res.headers.get('x-middleware-request-x-client-is-demo')).toBe('1')
            expect(res.headers.get('x-middleware-request-x-client-display-name')).toBe('Mat%C3%ADas%20Soto')
            expect(res.headers.get('x-middleware-request-x-vta-mode')).toBe('return')
        })

        it('sin cookie de modo ⇒ `remote` (nunca promete una vuelta que no puede cumplir)', async () => {
            getUser.mockResolvedValue({ data: { user: { id: 'demo-1' } } })
            sessionRows = { clients: DEMO_CLIENT }

            const res = await proxy(req('/c/studio-fuerza-qa/dashboard'))

            expect(res.headers.get('x-middleware-request-x-vta-mode')).toBe('remote')
        })

        it('alumno REAL: los tres headers viajan VACÍOS aunque el visitante los mande a mano', async () => {
            getUser.mockResolvedValue({ data: { user: { id: 'alumna-real' } } })
            sessionRows = { clients: { ...DEMO_CLIENT, id: 'alumna-real', is_demo: false, full_name: 'Ana Riquelme' } }

            const spoofed = new NextRequest('https://www.eva-app.cl/c/studio-fuerza-qa/dashboard', {
                headers: {
                    'x-client-is-demo': '1',
                    'x-client-display-name': 'Quien%20yo%20quiera',
                    'x-vta-mode': 'return',
                },
            })
            const res = await proxy(spoofed)

            expect(res.headers.get('x-middleware-request-x-client-is-demo')).toBe('')
            expect(res.headers.get('x-middleware-request-x-client-display-name')).toBe('')
            expect(res.headers.get('x-middleware-request-x-vta-mode')).toBe('')
        })
    })
})
