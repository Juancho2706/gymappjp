import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Webhook de Resend. Es un endpoint PÚBLICO que escribe en la DB, así que la mitad de estos tests
 * son de la puerta (secreto ausente = 503, firma mala = 401, replay = 401) y la otra mitad del
 * mapeo de eventos.
 *
 * Nombres de evento verificados el 2026-08-21 en
 * https://resend.com/docs/dashboard/webhooks/event-types
 */

const fakeAdmin = { __marker: 'admin' }
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => fakeAdmin,
}))

const updateStatusByProviderMessageId = vi.fn()
const findByProviderMessageId = vi.fn()
vi.mock('@/infrastructure/db/coach-email-ledger.repository', () => ({
    updateStatusByProviderMessageId: (...a: unknown[]) => updateStatusByProviderMessageId(...a),
    findByProviderMessageId: (...a: unknown[]) => findByProviderMessageId(...a),
}))

import { POST } from './route'

const SECRET = `whsec_${Buffer.from('eva-webhook-secret-1234567890').toString('base64')}`
const SVIX_ID = 'msg_1'

const originalSecret = process.env.RESEND_WEBHOOK_SECRET

function signedRequest(
    body: unknown,
    opts: { secret?: string; id?: string; timestampMs?: number; signature?: string } = {}
): Request {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    const id = opts.id ?? SVIX_ID
    const timestamp = String(Math.floor((opts.timestampMs ?? Date.now()) / 1000))
    const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
    const signature =
        opts.signature ??
        `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')}`
    return new Request('http://localhost/api/webhooks/resend', {
        method: 'POST',
        body: raw,
        headers: {
            'content-type': 'application/json',
            'svix-id': id,
            'svix-timestamp': timestamp,
            'svix-signature': signature,
        },
    })
}

const event = (type: string, emailId: string | null = 'res-1', extra: Record<string, unknown> = {}) => ({
    type,
    created_at: '2026-08-22T01:00:00.000Z',
    data: emailId ? { email_id: emailId, ...extra } : { ...extra },
})

beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.RESEND_WEBHOOK_SECRET = SECRET
    updateStatusByProviderMessageId.mockResolvedValue({ matched: true })
    findByProviderMessageId.mockResolvedValue(null)
})

afterEach(() => {
    vi.restoreAllMocks()
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret
})

describe('POST /api/webhooks/resend — puerta', () => {
    it('sin RESEND_WEBHOOK_SECRET → 503 y CERO escrituras (fail-closed)', async () => {
        delete process.env.RESEND_WEBHOOK_SECRET
        const res = await POST(signedRequest(event('email.delivered')))
        expect(res.status).toBe(503)
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('firma inválida → 401 y CERO escrituras', async () => {
        const res = await POST(signedRequest(event('email.delivered'), { signature: 'v1,AAAA' }))
        expect(res.status).toBe(401)
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('firmado con OTRO secreto → 401', async () => {
        const res = await POST(
            signedRequest(event('email.delivered'), {
                secret: `whsec_${Buffer.from('secreto-ajeno').toString('base64')}`,
            })
        )
        expect(res.status).toBe(401)
    })

    it('replay: timestamp de hace 10 minutos → 401 aunque la firma sea correcta', async () => {
        const res = await POST(
            signedRequest(event('email.delivered'), { timestampMs: Date.now() - 10 * 60 * 1000 })
        )
        expect(res.status).toBe(401)
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('sin headers svix → 401', async () => {
        const res = await POST(
            new Request('http://localhost/api/webhooks/resend', {
                method: 'POST',
                body: JSON.stringify(event('email.delivered')),
            })
        )
        expect(res.status).toBe(401)
    })

    it('body manipulado después de firmar → 401 (la firma cubre el body crudo)', async () => {
        const raw = JSON.stringify(event('email.delivered'))
        const timestamp = String(Math.floor(Date.now() / 1000))
        const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64')
        const signature = `v1,${createHmac('sha256', key).update(`${SVIX_ID}.${timestamp}.${raw}`).digest('base64')}`
        const res = await POST(
            new Request('http://localhost/api/webhooks/resend', {
                method: 'POST',
                body: JSON.stringify(event('email.bounced')),
                headers: {
                    'svix-id': SVIX_ID,
                    'svix-timestamp': timestamp,
                    'svix-signature': signature,
                },
            })
        )
        expect(res.status).toBe(401)
    })
})

describe('POST /api/webhooks/resend — mapeo de eventos', () => {
    it('email.sent → status sent + sent_at, con guard de orden', async () => {
        const res = await POST(signedRequest(event('email.sent')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, status: 'sent' })
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            { status: 'sent', sent_at: '2026-08-22T01:00:00.000Z' },
            { onlyFromStatuses: ['scheduled', 'sent', 'failed'] }
        )
    })

    it('email.delivered → status delivered + delivered_at', async () => {
        const res = await POST(signedRequest(event('email.delivered')))
        expect(res.status).toBe(200)
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            { status: 'delivered', delivered_at: '2026-08-22T01:00:00.000Z' },
            { onlyFromStatuses: ['scheduled', 'sent', 'delivered', 'failed'] }
        )
    })

    it('email.bounced → status bounced SIN guard de orden (la señal no se puede perder)', async () => {
        const res = await POST(signedRequest(event('email.bounced')))
        expect(res.status).toBe(200)
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            { status: 'bounced' },
            { onlyFromStatuses: undefined }
        )
    })

    it('email.complained → status complained', async () => {
        await POST(signedRequest(event('email.complained')))
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            { status: 'complained' },
            { onlyFromStatuses: undefined }
        )
    })

    it('email.delivery_delayed → NO cambia el estado, solo anota y CONSERVA el payload', async () => {
        findByProviderMessageId.mockResolvedValue({
            id: 'row-1',
            status: 'sent',
            payload: { to: 'coach@example.com', subject: 'Hola' },
        })
        const res = await POST(signedRequest(event('email.delivery_delayed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, status: 'sent' })
        // M-1: el `onlyFromStatuses` con el estado recién leído es el guard de la carrera — este
        // evento reescribe `status` con su valor viejo, y sin guard un `bounced` que entra entre el
        // SELECT y el UPDATE quedaría revertido a `sent` por una simple anotación de demora.
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            {
                status: 'sent',
                payload: {
                    to: 'coach@example.com',
                    subject: 'Hola',
                    delivery_delayed_at: '2026-08-22T01:00:00.000Z',
                },
            },
            { onlyFromStatuses: ['sent'] }
        )
    })

    it('email.delivery_delayed que pierde la carrera (el estado cambió) → 200 sin pisar nada', async () => {
        findByProviderMessageId.mockResolvedValue({ id: 'row-1', status: 'sent', payload: {} })
        updateStatusByProviderMessageId.mockResolvedValue({ matched: false })
        const res = await POST(signedRequest(event('email.delivery_delayed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ignored: true, reason: 'stale_status' })
    })

    it('email.delivery_delayed sin fila → 200 ignorado, sin update', async () => {
        findByProviderMessageId.mockResolvedValue(null)
        const res = await POST(signedRequest(event('email.delivery_delayed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ignored: true, reason: 'no_ledger_row' })
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    // M-9: los dos eventos que significan «el correo NUNCA salió». Dejan la fila `failed`, que es el
    // único estado fuera de `ACTIVE_LEDGER_STATUSES` ⇒ el correo se puede reintentar.
    it('email.failed → status failed con el motivo en payload.error, conservando el payload', async () => {
        findByProviderMessageId.mockResolvedValue({
            id: 'row-1',
            status: 'sent',
            payload: { to: 'coach@example.com', day: 2 },
        })
        const res = await POST(
            signedRequest(event('email.failed', 'res-1', { failed: { reason: 'Invalid recipient' } }))
        )
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, status: 'failed' })
        expect(updateStatusByProviderMessageId).toHaveBeenCalledWith(
            fakeAdmin,
            'res-1',
            {
                status: 'failed',
                payload: { to: 'coach@example.com', day: 2, error: 'Invalid recipient' },
            },
            { onlyFromStatuses: ['scheduled', 'sent', 'failed'] }
        )
    })

    it('email.failed sin motivo → igual marca failed, sin inventar payload.error', async () => {
        findByProviderMessageId.mockResolvedValue({ id: 'row-1', status: 'scheduled', payload: {} })
        await POST(signedRequest(event('email.failed')))
        expect(updateStatusByProviderMessageId.mock.calls[0][2]).toEqual({
            status: 'failed',
            payload: {},
        })
    })

    it('email.suppressed → status failed con payload.suppressed = true', async () => {
        findByProviderMessageId.mockResolvedValue({
            id: 'row-1',
            status: 'sent',
            payload: { to: 'coach@example.com' },
        })
        const res = await POST(signedRequest(event('email.suppressed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, status: 'failed' })
        expect(updateStatusByProviderMessageId.mock.calls[0][2]).toEqual({
            status: 'failed',
            payload: { to: 'coach@example.com', suppressed: true },
        })
    })

    // El guard existe justo para esto: `failed` reabre el dedupe, así que no puede pisar la señal de
    // una dirección que YA rebotó o que se quejó (a ésa no se le vuelve a escribir nunca).
    it('email.failed que llega tarde sobre un `bounced` → no matchea, 200 sin tocar la fila', async () => {
        findByProviderMessageId.mockResolvedValue({ id: 'row-1', status: 'bounced', payload: {} })
        updateStatusByProviderMessageId.mockResolvedValue({ matched: false })
        const res = await POST(signedRequest(event('email.failed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ignored: true, reason: 'stale_status' })
    })

    it('email.failed sin fila en el ledger → 200 ignorado, sin update', async () => {
        findByProviderMessageId.mockResolvedValue(null)
        const res = await POST(signedRequest(event('email.failed')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ignored: true, reason: 'no_ledger_row' })
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('evento no manejado (email.opened) → 200 ignorado, cero escrituras', async () => {
        const res = await POST(signedRequest(event('email.opened')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({
            ignored: true,
            reason: 'unhandled_event',
        })
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('sin data.email_id → 200 ignorado', async () => {
        const res = await POST(signedRequest(event('email.delivered', null)))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({
            ignored: true,
            reason: 'missing_email_id',
        })
        expect(updateStatusByProviderMessageId).not.toHaveBeenCalled()
    })

    it('email_id que no está en el ledger → 200 ignorado (la mayoría de los correos no pasa por acá)', async () => {
        updateStatusByProviderMessageId.mockResolvedValue({ matched: false })
        const res = await POST(signedRequest(event('email.delivered', 'res-desconocido')))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ignored: true, reason: 'no_ledger_row' })
    })

    it('body ilegible con firma válida → 200 ignorado (reintentar daría lo mismo)', async () => {
        const res = await POST(signedRequest('no-soy-json'))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({
            ignored: true,
            reason: 'unparsable_body',
        })
    })

    it('re-entrega del MISMO evento → idempotente (mismo patch, sin efectos extra)', async () => {
        const req1 = signedRequest(event('email.delivered'))
        const req2 = signedRequest(event('email.delivered'))
        expect((await POST(req1)).status).toBe(200)
        expect((await POST(req2)).status).toBe(200)
        expect(updateStatusByProviderMessageId.mock.calls[0][2]).toEqual(
            updateStatusByProviderMessageId.mock.calls[1][2]
        )
    })

    it('la DB falla → 500 para que Svix reintente (nunca perder el evento en un 200)', async () => {
        updateStatusByProviderMessageId.mockRejectedValue(new Error('db down'))
        const res = await POST(signedRequest(event('email.delivered')))
        expect(res.status).toBe(500)
    })
})
