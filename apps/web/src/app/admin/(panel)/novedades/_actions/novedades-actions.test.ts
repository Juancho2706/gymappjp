import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assertAdminMock, logAdminActionMock, notifyMock, revalidatePathMock } = vi.hoisted(() => ({
    assertAdminMock: vi.fn(),
    logAdminActionMock: vi.fn(),
    notifyMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/admin/admin-action-wrapper', () => ({
    assertAdmin: assertAdminMock,
    logAdminAction: logAdminActionMock,
}))
// La push es best-effort y vive en el catálogo de eventos; acá solo importa CUÁNDO se dispara.
vi.mock('@/lib/push-events', () => ({ notifyCoachesOfNewsPublished: notifyMock }))

import { publishNewsItemAction } from './novedades-actions'

function adminClientFor(current: { published_at: string | null; title: string; content: string } | null) {
    const maybeSingle = vi.fn(async () => ({ data: current, error: null }))
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }))
    const from = vi.fn(() => ({ select, update }))
    return { client: { from }, update }
}

describe('publishNewsItemAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        notifyMock.mockResolvedValue({ users: 90, tokens: 16, sent: 16 })
    })

    it('primera publicación: sella published_at, avisa por push a los coaches y audita los conteos', async () => {
        const { client, update } = adminClientFor({ published_at: null, title: 'Esta semana', content: 'Hola\n- x' })
        assertAdminMock.mockResolvedValue({ adminClient: client, user: { id: 'admin' } })

        const res = await publishNewsItemAction('n1')

        expect(res).toEqual({ success: true })
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', published_at: expect.any(String) }))
        expect(notifyMock).toHaveBeenCalledWith(client, { newsItemId: 'n1', title: 'Esta semana', content: 'Hola\n- x' })
        expect(logAdminActionMock).toHaveBeenCalledWith(
            client,
            'publish_news_item',
            'news_items',
            'n1',
            expect.objectContaining({ published_at_preserved: false, push_users: 90, push_tokens: 16, push_sent: 16 })
        )
        expect(revalidatePathMock).toHaveBeenCalledWith('/admin/novedades')
    })

    it('restaurar un archivado conserva la fecha y NO vuelve a sonar en el teléfono', async () => {
        const { client, update } = adminClientFor({ published_at: '2026-01-05T00:00:00.000Z', title: 't', content: 'c' })
        assertAdminMock.mockResolvedValue({ adminClient: client, user: { id: 'admin' } })

        const res = await publishNewsItemAction('n1')

        expect(res).toEqual({ success: true })
        expect(update).toHaveBeenCalledWith({ status: 'published' })
        expect(notifyMock).not.toHaveBeenCalled()
        expect(logAdminActionMock).toHaveBeenCalledWith(
            client,
            'publish_news_item',
            'news_items',
            'n1',
            expect.objectContaining({ published_at_preserved: true })
        )
        expect(logAdminActionMock.mock.calls[0][4]).not.toHaveProperty('push_sent')
    })

    it('si la novedad ya no existe, no publica ni avisa', async () => {
        const { client, update } = adminClientFor(null)
        assertAdminMock.mockResolvedValue({ adminClient: client, user: { id: 'admin' } })

        const res = await publishNewsItemAction('n1')

        expect(res).toEqual({ success: false, error: 'La novedad ya no existe' })
        expect(update).not.toHaveBeenCalled()
        expect(notifyMock).not.toHaveBeenCalled()
    })
})
