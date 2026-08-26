import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Login del ALUMNO (`/c/[coach_slug]/login`). Molde: `(auth)/login/actions.test.ts`.
 *
 * Lo que pinnea («Vive tu app» directo §4, decisión D4 = B): el coach que entra con SU cuenta
 * —en su propio slug o en el de otro— recibe `kind: 'coach_account'` con una salida, y la sesión
 * se cierra con alcance LOCAL. Antes caía en «No tienes acceso a esta plataforma.» / «Coach no
 * encontrado.» y el `signOut()` global lo deslogueaba en todos sus dispositivos.
 */

const {
    capturePostHogServerEventMock,
    createClientMock,
    createServiceRoleClientMock,
    getClientBasePathMock,
    recordStudentFirstLoginMock,
    redirectMock,
    setLastWorkspaceMock,
} = vi.hoisted(() => ({
    capturePostHogServerEventMock: vi.fn().mockResolvedValue(undefined),
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    getClientBasePathMock: vi.fn().mockResolvedValue('/c/mi-coach'),
    recordStudentFirstLoginMock: vi.fn().mockResolvedValue(true),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`)
    }),
    setLastWorkspaceMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/client/base-path', () => ({ getClientBasePath: getClientBasePathMock }))
vi.mock('@/services/auth/workspace.service', () => ({ setLastWorkspace: setLastWorkspaceMock }))
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: capturePostHogServerEventMock,
}))
vi.mock('@/services/client/student-login-signal.service', () => ({
    recordStudentFirstLogin: recordStudentFirstLoginMock,
}))

import { clientLoginAction } from './login.actions'
import { coachAccountMessage } from '@/lib/auth/student-login-messages'

function buildFormData(email: string, password: string, coachSlug: string) {
    const formData = new FormData()
    formData.set('email', email)
    formData.set('password', password)
    formData.set('coach_slug', coachSlug)
    return formData
}

type CoachRow = { id: string; persona?: string | null; slug?: string; invite_code?: string } | null
type ClientRow = Record<string, unknown> | null

/**
 * `coaches` se consulta DOS veces con la misma tabla: el self-check (`.eq('id', user.id)`) y la
 * resolución del slug (`.eq('slug'|'invite_code', ...)`). El fake decide por la columna del `eq`.
 */
function buildSupabase(options: {
    selfCoach?: CoachRow
    slugCoach?: CoachRow
    client?: ClientRow
    signInError?: boolean
}) {
    const { selfCoach = null, slugCoach = { id: 'coach-1' }, client = null, signInError = false } = options

    const signOut = vi.fn().mockResolvedValue({ error: null })

    const coachesBuilder = () => {
        let column: string | null = null
        const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn((col: string) => {
                column = col
                return builder
            }),
            maybeSingle: vi.fn(async () => ({
                data: column === 'id' ? selfCoach : slugCoach,
                error: null,
            })),
        }
        return builder
    }

    const clientsBuilder = () => {
        const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => ({ data: client, error: null })),
        }
        return builder
    }

    return {
        auth: {
            signInWithPassword: vi.fn().mockResolvedValue({
                error: signInError ? { message: 'Invalid login credentials' } : null,
            }),
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
            signOut,
        },
        from: vi.fn((table: string) => {
            if (table === 'coaches') return coachesBuilder()
            if (table === 'clients') return clientsBuilder()
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
}

describe('clientLoginAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientBasePathMock.mockResolvedValue('/c/mi-coach')
        capturePostHogServerEventMock.mockResolvedValue(undefined)
        recordStudentFirstLoginMock.mockResolvedValue(true)
        // El action crea el admin para la señal del primer login (y para la rama org).
        createServiceRoleClientMock.mockReturnValue({ __admin: true })
    })

    it('manda al dashboard al alumno del coach', async () => {
        const supabase = buildSupabase({
            client: {
                id: 'u1',
                coach_id: 'coach-1',
                org_id: null,
                force_password_change: false,
                is_active: true,
                is_archived: false,
            },
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('alumna@example.com', 'secret123', 'mi-coach'))

        expect(result).toEqual({ success: true, redirectUrl: '/c/mi-coach/dashboard' })
        expect(supabase.auth.signOut).not.toHaveBeenCalled()
        expect(setLastWorkspaceMock).toHaveBeenCalledTimes(1)
        // V3.13 / FCN W1.4: el login del alumno sella el primer login UNA vez, con la PK de
        // `clients` (no el uid de auth) y ESPERADO antes de devolver el redirect.
        expect(recordStudentFirstLoginMock).toHaveBeenCalledTimes(1)
        expect(recordStudentFirstLoginMock).toHaveBeenCalledWith(expect.anything(), 'u1')
    })

    it('devuelve credenciales incorrectas sin tocar la sesión', async () => {
        const supabase = buildSupabase({ signInError: true })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('alumna@example.com', 'mala', 'mi-coach'))

        expect(result).toEqual({ error: 'Email o contraseña incorrectos.' })
        expect(supabase.from).not.toHaveBeenCalled()
    })

    it('reconoce al coach en SU propio slug y cierra la sesión solo en este dispositivo', async () => {
        const supabase = buildSupabase({
            selfCoach: { id: 'u1', persona: 'nutrition', slug: 'mi-coach', invite_code: 'AB2CD' },
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('coach@example.com', 'secret123', 'mi-coach'))

        expect(result.kind).toBe('coach_account')
        expect(result.error).toBe(coachAccountMessage('nutrition'))
        // Vocabulario por persona (regla 8): nutrición dice «paciente», no «alumno».
        expect(result.error).toContain('paciente')
        expect(result.action).toEqual({ href: '/login', label: 'Ir al login de coach' })
        expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
        expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith({
            event: 'student_login_coach_account',
            distinctId: 'u1',
            properties: { surface: 'web', own_slug: true },
        })
    })

    it('reconoce al coach en el slug de OTRO coach (antes: «Coach no encontrado.»)', async () => {
        const supabase = buildSupabase({
            selfCoach: { id: 'u1', persona: 'strength', slug: 'mi-coach', invite_code: 'AB2CD' },
            slugCoach: { id: 'coach-2' },
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('coach@example.com', 'secret123', 'otro-coach'))

        expect(result.kind).toBe('coach_account')
        expect(result.error).toBe(coachAccountMessage('strength'))
        expect(result.action).toEqual({ href: '/login', label: 'Ir al login de coach' })
        expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith(
            expect.objectContaining({ properties: { surface: 'web', own_slug: false } })
        )
    })

    it('sin fila de coach ni de alumno: mensaje de siempre y signOut LOCAL', async () => {
        const supabase = buildSupabase({ client: null })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('nadie@example.com', 'secret123', 'mi-coach'))

        expect(result).toEqual({ error: 'No tienes acceso a esta plataforma.' })
        expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(capturePostHogServerEventMock).not.toHaveBeenCalled()
        // Sin fila de alumno no hay señal que sellar.
        expect(recordStudentFirstLoginMock).not.toHaveBeenCalled()
    })

    it('slug inexistente: signOut LOCAL, no global', async () => {
        const supabase = buildSupabase({ slugCoach: null })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('alumna@example.com', 'secret123', 'no-existe'))

        expect(result).toEqual({ error: 'Coach no encontrado.' })
        expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('respeta el base path del alumno de pool (no vuelca a /c)', async () => {
        getClientBasePathMock.mockResolvedValue('/t/equipo-x')
        const supabase = buildSupabase({
            client: {
                id: 'u1',
                coach_id: 'coach-1',
                org_id: null,
                force_password_change: true,
                is_active: true,
                is_archived: false,
            },
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await clientLoginAction({}, buildFormData('alumna@example.com', 'secret123', 'mi-coach'))

        expect(result.redirectUrl).toBe('/t/equipo-x/change-password')
    })
})
