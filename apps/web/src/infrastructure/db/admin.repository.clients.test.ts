import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { findAdminClientsForDashboard } from './admin.repository'

/**
 * Pedido del owner 05-09: los alumnos de prueba (`clients.is_demo = true`) NO deben contar como
 * alumnos en la seccion Alumnos del panel CEO. El listado y `total` salen sin demos; `demoTotal`
 * los cuenta aparte con LOS MISMOS filtros (si divergieran, el chip mentiria sobre otro universo).
 *
 * Cliente falso con la FORMA de supabase-js: cada eslabon devuelve el mismo builder y el resultado
 * se resuelve al final (await sobre el query).
 */
type Call = {
    op: 'list' | 'demoCount'
    head: boolean
    filters: Array<[string, string, unknown]>
}

function fakeDb(listResult: unknown, demoResult: unknown) {
    const calls: Call[] = []

    const db = {
        from: () => ({
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
                const call: Call = { op: 'list', head: opts?.head === true, filters: [] }
                calls.push(call)
                const chain: Record<string, unknown> = {
                    eq: (column: string, value: unknown) => {
                        call.filters.push([column, 'eq', value])
                        if (column === 'is_demo') call.op = value === true ? 'demoCount' : 'list'
                        return chain
                    },
                    is: (column: string, value: unknown) => {
                        call.filters.push([column, 'is', value])
                        return chain
                    },
                    not: (column: string, operator: string, value: unknown) => {
                        call.filters.push([column, `not.${operator}`, value])
                        return chain
                    },
                    or: (filters: string) => {
                        call.filters.push(['*', 'or', filters])
                        return chain
                    },
                    order: () => chain,
                    range: (from: number, to: number) => {
                        call.filters.push(['*', 'range', [from, to]])
                        return Promise.resolve(listResult)
                    },
                    then: (resolve: (value: unknown) => unknown) => Promise.resolve(demoResult).then(resolve),
                }
                return chain
            },
        }),
    }

    return { db: db as unknown as SupabaseClient<Database>, calls }
}

const listOk = {
    data: [{ id: 'c1', full_name: 'Real', email: 'r@e.cl', coach_id: 'k1', is_active: true, is_archived: false, created_at: '2026-09-01T00:00:00.000Z', onboarding_completed: true, coaches: { full_name: 'Coach' } }],
    count: 110,
    error: null,
}
const demoOk = { data: null, count: 45, error: null }

describe('findAdminClientsForDashboard — alumnos de prueba fuera del conteo', () => {
    it('lista y `total` excluyen is_demo; `demoTotal` los cuenta aparte', async () => {
        const { db, calls } = fakeDb(listOk, demoOk)

        const res = await findAdminClientsForDashboard(db, { pageSize: 50, offset: 0 })

        expect(res.total).toBe(110)
        expect(res.demoTotal).toBe(45)
        expect(res.clients).toHaveLength(1)

        const list = calls.find(c => c.op === 'list')!
        const demo = calls.find(c => c.op === 'demoCount')!
        expect(list.filters).toContainEqual(['is_demo', 'eq', false])
        expect(demo.filters).toContainEqual(['is_demo', 'eq', true])
        expect(demo.head).toBe(true)
    })

    it('los filtros de la seccion se aplican IGUAL al listado y al conteo de demos', async () => {
        const { db, calls } = fakeDb(listOk, demoOk)

        await findAdminClientsForDashboard(db, {
            search: 'ana',
            coachId: 'coach-1',
            estado: 'activo',
            onboarding: 'pendiente',
            pageSize: 50,
            offset: 0,
        })

        const shared = (c: Call) => c.filters.filter(f => f[0] !== 'is_demo' && f[1] !== 'range')
        const list = calls.find(c => c.op === 'list')!
        const demo = calls.find(c => c.op === 'demoCount')!
        expect(shared(demo)).toEqual(shared(list))
        expect(shared(list)).toEqual([
            ['*', 'or', 'full_name.ilike.%ana%,email.ilike.%ana%'],
            ['coach_id', 'eq', 'coach-1'],
            ['is_archived', 'eq', false],
            ['is_active', 'not.is', false],
            ['onboarding_completed', 'eq', false],
        ])
    })

    it('error en el listado → vacio, pero `demoTotal` sigue informando', async () => {
        const { db } = fakeDb({ data: null, count: null, error: { message: 'boom' } }, demoOk)

        await expect(findAdminClientsForDashboard(db, { pageSize: 50, offset: 0 })).resolves.toEqual({
            clients: [],
            total: 0,
            demoTotal: 45,
        })
    })
})
