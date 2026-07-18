import { describe, expect, it, vi } from 'vitest'
import {
    applyMobileClientScope,
    mobileContextOwnsClient,
    type MobileClientMutationContext,
} from './_mutation-auth'

function queryResult(data: { id: string } | null, error: Error | null = null) {
    const filters: Array<[string, string, unknown]> = []
    const query: Record<string, unknown> = {}
    query.select = vi.fn(() => query)
    query.eq = vi.fn((column: string, value: unknown) => {
        filters.push(['eq', column, value])
        return query
    })
    query.is = vi.fn((column: string, value: unknown) => {
        filters.push(['is', column, value])
        return query
    })
    query.maybeSingle = vi.fn(async () => ({ data, error }))
    return { query, filters }
}

function enterpriseContext(input?: {
    client?: { id: string } | null
    assignment?: { id: string } | null
    clientError?: Error | null
    assignmentError?: Error | null
}) {
    const clientRow = input && 'client' in input ? input.client ?? null : { id: 'client-1' }
    const assignmentRow = input && 'assignment' in input ? input.assignment ?? null : { id: 'assignment-1' }
    const client = queryResult(clientRow, input?.clientError)
    const assignment = queryResult(assignmentRow, input?.assignmentError)
    const admin = {
        from: vi.fn((table: string) => table === 'clients' ? client.query : assignment.query),
    }
    const context = {
        admin,
        userDb: {},
        userId: 'coach-1',
        scope: { type: 'enterprise', orgId: 'org-1' },
    } as unknown as MobileClientMutationContext
    return { context, admin, client, assignment }
}

describe('mobile client mutation auth — enterprise assignments', () => {
    it('autoriza solo cuando existen cliente org-scoped y asignacion activa del coach', async () => {
        const { context, client, assignment } = enterpriseContext()

        await expect(mobileContextOwnsClient(context, 'client-1')).resolves.toBe(true)
        expect(client.filters).toEqual([
            ['eq', 'id', 'client-1'],
            ['eq', 'org_id', 'org-1'],
            ['is', 'team_id', null],
        ])
        expect(assignment.filters).toEqual([
            ['eq', 'org_id', 'org-1'],
            ['eq', 'client_id', 'client-1'],
            ['eq', 'coach_id', 'coach-1'],
            ['is', 'deleted_at', null],
        ])
    })

    it('rechaza cliente sin asignacion activa', async () => {
        const { context } = enterpriseContext({ assignment: null })
        await expect(mobileContextOwnsClient(context, 'client-1')).resolves.toBe(false)
    })

    it('falla cerrado ante error en cualquiera de las dos lecturas', async () => {
        const { context } = enterpriseContext({ assignmentError: new Error('db unavailable') })
        await expect(mobileContextOwnsClient(context, 'client-1')).resolves.toBe(false)
    })

    it('scopea la mutacion por org despues del guard, sin exigir clients.coach_id legacy', () => {
        const { context } = enterpriseContext()
        const mutation = queryResult(null)
        applyMobileClientScope(mutation.query, context)
        expect(mutation.filters).toEqual([
            ['eq', 'org_id', 'org-1'],
            ['is', 'team_id', null],
        ])
    })
})
