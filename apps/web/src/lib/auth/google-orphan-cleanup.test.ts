import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Limpieza del auth user huérfano que deja «Continuar con Google» en el login de COACH (caso
 * Leonardo/Movens 2026-09-04). Lo que se pinnea: se borra SOLO al usuario demostrablemente vacío
 * (solo identidad google + cero filas de identidad en EVA), y cualquier duda —una identidad `email`,
 * una fila en cualquiera de las tablas, un error de lectura— deja al usuario como está.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '55555555-5555-4555-8555-555555555555'
    const state = {
        user: { id: USER_ID, email: 'alumno@gmail.com' } as { id: string; email?: string | null } | null,
        identities: ['google'] as string[],
        rows: {} as Record<string, unknown[]>,
        errors: {} as Record<string, boolean>,
    }
    const deletions: string[] = []
    const queries: Array<{ table: string; column: string; value: unknown }> = []
    const capturePostHogServerEventMock = vi.fn(async () => undefined)

    const adminStub = {
        from: (table: string) => {
            const finish = async () =>
                state.errors[table]
                    ? { data: null, error: { message: 'boom' } }
                    : { data: state.rows[table] ?? [], error: null }
            const tail = { limit: finish }
            return {
                select: () => ({
                    eq: (column: string, value: unknown) => {
                        queries.push({ table, column, value })
                        return { ...tail, is: () => tail }
                    },
                }),
            }
        },
        auth: {
            admin: {
                getUserById: async (id: string) =>
                    state.user
                        ? {
                              data: {
                                  user: {
                                      id,
                                      email: state.user.email,
                                      identities: state.identities.map((provider) => ({ provider })),
                                  },
                              },
                              error: null,
                          }
                        : { data: { user: null }, error: { message: 'not found' } },
                deleteUser: async (id: string) => {
                    deletions.push(id)
                    return state.errors.__delete ? { data: null, error: { message: 'fk' } } : { data: {}, error: null }
                },
            },
        },
    }

    return { USER_ID, state, deletions, queries, adminStub, capturePostHogServerEventMock }
})

const { USER_ID, state, deletions, queries, capturePostHogServerEventMock } = harness

vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: harness.capturePostHogServerEventMock,
}))

import { deleteGoogleOrphanAuthUser } from './google-orphan-cleanup'

const admin = harness.adminStub as never

beforeEach(() => {
    vi.clearAllMocks()
    deletions.length = 0
    queries.length = 0
    state.user = { id: USER_ID, email: 'alumno@gmail.com' }
    state.identities = ['google']
    state.rows = {}
    state.errors = {}
})

describe('deleteGoogleOrphanAuthUser', () => {
    it('borra al usuario solo-Google sin ninguna fila de identidad y deja telemetría con el contexto', async () => {
        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: true })
        expect(deletions).toEqual([USER_ID])
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith({
            event: 'google_orphan_auth_user_deleted',
            distinctId: USER_ID,
            properties: { context: 'post_google_auth' },
        })
    })

    it('mira las cinco tablas de identidad por la columna correcta y `platform_admins` por correo normalizado', async () => {
        state.user = { id: USER_ID, email: '  Admin@EVA-app.cl ' }

        await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(queries).toEqual(
            expect.arrayContaining([
                { table: 'coaches', column: 'id', value: USER_ID },
                { table: 'clients', column: 'id', value: USER_ID },
                { table: 'client_accounts', column: 'id', value: USER_ID },
                { table: 'client_memberships', column: 'account_id', value: USER_ID },
                { table: 'organization_members', column: 'user_id', value: USER_ID },
                { table: 'platform_admins', column: 'email', value: 'admin@eva-app.cl' },
            ])
        )
    })

    it('NO borra si además tiene identidad `email`: alguna vez tuvo contraseña propia', async () => {
        state.identities = ['email', 'google']

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'not_google_only' })
        expect(deletions).toHaveLength(0)
    })

    it('NO borra a un usuario sin identidad de Google (una sesión con contraseña que llame al endpoint)', async () => {
        state.identities = ['email']

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'not_google_only' })
        expect(deletions).toHaveLength(0)
    })

    it.each([
        ['coaches'],
        ['clients'],
        ['client_accounts'],
        ['client_memberships'],
        ['organization_members'],
        ['platform_admins'],
    ])('NO borra si hay una fila en %s', async (table) => {
        state.rows[table] = [{ id: 'x' }]

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'has_rows' })
        expect(deletions).toHaveLength(0)
    })

    it('fail-closed: un error de lectura cuenta como «tiene filas» y no se borra nada', async () => {
        state.errors.clients = true

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'has_rows' })
        expect(deletions).toHaveLength(0)
    })

    it('si GoTrue rechaza el borrado, lo dice y no emite telemetría', async () => {
        state.errors.__delete = true

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'mobile_post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'delete_failed' })
        expect(capturePostHogServerEventMock).not.toHaveBeenCalled()
    })

    it('usuario inexistente (ya borrado por la otra puerta): no_user, sin escrituras', async () => {
        state.user = null

        const result = await deleteGoogleOrphanAuthUser({ admin, userId: USER_ID, context: 'post_google_auth' })

        expect(result).toEqual({ deleted: false, reason: 'no_user' })
        expect(deletions).toHaveLength(0)
    })
})
