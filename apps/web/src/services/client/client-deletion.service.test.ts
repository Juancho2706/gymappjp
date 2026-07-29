import { describe, expect, it, vi } from 'vitest'
import { deleteClientHard } from './client-deletion.service'

// Reglas que estos tests blindan:
// - alumno puro → auth.admin.deleteUser (cascada total), NUNCA delete directo de la fila.
// - coach-como-alumno → delete de la fila `clients`, JAMÁS deleteUser (mataría su cuenta de coach).
// - lookup de `coaches` roto → fail-closed, no se borra nada.
// - Storage es best-effort: si revienta, el borrado igual ocurre.

type StorageFile = { name: string; id: string | null }

function makeAdminDb(opts: {
    coachProfile?: { id: string } | null
    coachLookupError?: { message: string } | null
    deleteUserError?: { message: string; status?: number; code?: string } | null
    rowDeleteError?: { message: string } | null
    storageFiles?: Record<string, StorageFile[]>
    storageThrows?: boolean
}) {
    const calls = {
        tables: [] as string[],
        rowDeleteIds: [] as string[],
        deleteUserIds: [] as string[],
        removed: [] as string[][],
        listedPrefixes: [] as string[],
    }

    const from = vi.fn((table: string) => {
        calls.tables.push(table)
        if (table === 'coaches') {
            const builder: Record<string, unknown> = {}
            builder.select = vi.fn(() => builder)
            builder.eq = vi.fn(() => builder)
            builder.maybeSingle = vi.fn(() =>
                Promise.resolve({
                    data: opts.coachLookupError ? null : opts.coachProfile ?? null,
                    error: opts.coachLookupError ?? null,
                })
            )
            return builder
        }
        // clients: .delete().eq('id', …) resuelve la promesa en el .eq final.
        const builder: Record<string, unknown> = {}
        builder.delete = vi.fn(() => builder)
        builder.eq = vi.fn((_col: string, val: string) => {
            calls.rowDeleteIds.push(val)
            return Promise.resolve({ error: opts.rowDeleteError ?? null })
        })
        return builder
    })

    const storageBucket = {
        list: vi.fn((prefix: string) => {
            if (opts.storageThrows) throw new Error('storage down')
            calls.listedPrefixes.push(prefix)
            return Promise.resolve({ data: opts.storageFiles?.[prefix] ?? [], error: null })
        }),
        remove: vi.fn((paths: string[]) => {
            calls.removed.push(paths)
            return Promise.resolve({ data: null, error: null })
        }),
    }

    const adminDb = {
        from,
        storage: { from: vi.fn(() => storageBucket) },
        auth: {
            admin: {
                deleteUser: vi.fn((id: string) => {
                    calls.deleteUserIds.push(id)
                    return Promise.resolve({ data: null, error: opts.deleteUserError ?? null })
                }),
            },
        },
    } as never

    return { adminDb, calls, storageBucket }
}

describe('deleteClientHard', () => {
    it('alumno puro: borra el usuario de auth (cascada) y no toca la fila clients', async () => {
        const { adminDb, calls } = makeAdminDb({ coachProfile: null })
        expect(await deleteClientHard(adminDb, 'client-1')).toEqual({})
        expect(calls.deleteUserIds).toEqual(['client-1'])
        expect(calls.rowDeleteIds).toEqual([])
    })

    it('coach-como-alumno: borra la fila clients y NUNCA llama deleteUser', async () => {
        const { adminDb, calls } = makeAdminDb({ coachProfile: { id: 'client-1' } })
        expect(await deleteClientHard(adminDb, 'client-1')).toEqual({})
        expect(calls.deleteUserIds).toEqual([])
        expect(calls.rowDeleteIds).toEqual(['client-1'])
    })

    it('lookup de coaches roto: fail-closed, no borra nada', async () => {
        const { adminDb, calls } = makeAdminDb({ coachLookupError: { message: 'boom' } })
        const res = await deleteClientHard(adminDb, 'client-1')
        expect(res.code).toBe('COACH_LOOKUP_FAILED')
        expect(calls.deleteUserIds).toEqual([])
        expect(calls.rowDeleteIds).toEqual([])
    })

    it('deleteUser falla: devuelve AUTH_DELETE_FAILED y deja estado reintentable', async () => {
        const { adminDb, calls } = makeAdminDb({
            coachProfile: null,
            deleteUserError: { message: 'gotrue caido', status: 500 },
        })
        const res = await deleteClientHard(adminDb, 'client-1')
        expect(res).toEqual({ error: 'gotrue caido', code: 'AUTH_DELETE_FAILED' })
        expect(calls.rowDeleteIds).toEqual([])
    })

    it('usuario de auth inexistente (404): borra la fila huérfana en vez de bloquearse', async () => {
        const { adminDb, calls } = makeAdminDb({
            coachProfile: null,
            deleteUserError: { message: 'User not found', status: 404, code: 'user_not_found' },
        })
        expect(await deleteClientHard(adminDb, 'client-1')).toEqual({})
        expect(calls.rowDeleteIds).toEqual(['client-1'])
    })

    it('borra las fotos de check-in del alumno, incluido un nivel de subcarpetas', async () => {
        const { adminDb, calls } = makeAdminDb({
            coachProfile: null,
            storageFiles: {
                'client-1': [
                    { name: 'a.webp', id: 'obj-1' },
                    { name: '2026-07', id: null },
                ],
                'client-1/2026-07': [{ name: 'b.webp', id: 'obj-2' }],
            },
        })
        await deleteClientHard(adminDb, 'client-1')
        expect(calls.listedPrefixes).toContain('client-1')
        expect(calls.listedPrefixes).toContain('client-1/2026-07')
        expect(calls.removed.flat()).toEqual(['client-1/a.webp', 'client-1/2026-07/b.webp'])
    })

    it('Storage caído es best-effort: el borrado del alumno igual ocurre', async () => {
        const { adminDb, calls } = makeAdminDb({ coachProfile: null, storageThrows: true })
        expect(await deleteClientHard(adminDb, 'client-1')).toEqual({})
        expect(calls.deleteUserIds).toEqual(['client-1'])
    })
})
