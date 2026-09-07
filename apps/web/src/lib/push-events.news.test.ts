import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendExpoPushToUsersMock, getTestCoachIdsMock } = vi.hoisted(() => ({
    sendExpoPushToUsersMock: vi.fn(),
    getTestCoachIdsMock: vi.fn(),
}))

// El fan-out real pega a Expo y a `push_tokens`; acá se mide CUÁNDO y CON QUÉ se dispara.
vi.mock('./push', () => ({
    sendPushToClient: vi.fn(),
    sendExpoPushToUsers: sendExpoPushToUsersMock,
}))

// `getTestCoachIds` pagina `auth.users` con el admin API: fuera de un test de integración se mockea.
vi.mock('./test-accounts', () => ({
    getTestCoachIds: getTestCoachIdsMock,
}))

import { newsPushBody, notifyCoachesOfNewsPublished } from './push-events'

function adminWithCoaches(rows: { id: string }[] | null) {
    const eq = vi.fn(async () => ({ data: rows, error: null }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    return { client: { from } as any, from, select, eq }
}

describe('newsPushBody', () => {
    it('toma la primera línea con texto y le quita las marcas de markdown', () => {
        expect(newsPushBody('## Título\n\n- **Ciclos de verdad.** Tu alumno ve «Hoy toca».')).toBe(
            'Ciclos de verdad. Tu alumno ve «Hoy toca».'
        )
    })

    it('salta líneas vacías y separadores', () => {
        expect(newsPushBody('\n---\n\nTodo esto ya está en tu panel.')).toBe('Todo esto ya está en tu panel.')
    })

    it('recorta a 120 caracteres con puntos suspensivos', () => {
        const body = newsPushBody('a'.repeat(200))
        expect(body).toHaveLength(120)
        expect(body.endsWith('…')).toBe(true)
    })

    it('cae a la frase fija si no hay texto útil', () => {
        expect(newsPushBody('---\n\n  ')).toBe('Hay novedades en EVA. Tócalo para verlas.')
    })
})

describe('notifyCoachesOfNewsPublished', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('manda a los coaches activos menos las cuentas de prueba, con el título y la primera línea', async () => {
        const { client, from, eq } = adminWithCoaches([{ id: 'c1' }, { id: 'test' }, { id: 'c2' }])
        getTestCoachIdsMock.mockResolvedValue(new Set(['test']))
        sendExpoPushToUsersMock.mockResolvedValue({ users: 2, tokens: 3, sent: 3 })

        const res = await notifyCoachesOfNewsPublished(client, {
            newsItemId: 'n1',
            title: ' Esta semana ',
            content: '**Hola** coach\nmás',
        })

        expect(from).toHaveBeenCalledWith('coaches')
        expect(eq).toHaveBeenCalledWith('subscription_status', 'active')
        expect(sendExpoPushToUsersMock).toHaveBeenCalledWith(['c1', 'c2'], {
            event: 'news_published',
            title: 'Esta semana',
            body: 'Hola coach',
            url: '/coach/dashboard',
            screen: '/coach/(tabs)/home',
        })
        expect(res).toEqual({ users: 2, tokens: 3, sent: 3 })
    })

    it('sin coaches activos no toca Expo', async () => {
        const { client } = adminWithCoaches([])
        const res = await notifyCoachesOfNewsPublished(client, { newsItemId: 'n1', title: 't', content: 'c' })
        expect(sendExpoPushToUsersMock).not.toHaveBeenCalled()
        expect(res).toEqual({ users: 0, tokens: 0, sent: 0 })
    })

    it('jamás lanza: si la consulta explota devuelve ceros', async () => {
        const client = {
            from: vi.fn(() => {
                throw new Error('boom')
            }),
        } as any
        await expect(
            notifyCoachesOfNewsPublished(client, { newsItemId: 'n1', title: 't', content: 'c' })
        ).resolves.toEqual({ users: 0, tokens: 0, sent: 0 })
    })
})
