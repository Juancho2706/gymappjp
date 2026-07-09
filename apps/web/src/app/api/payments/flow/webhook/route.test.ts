import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ruta webhook de Flow (Ola 3, T3.4). Responsabilidad: auth propia (token en ?token=) + parseo del body
// urlencoded (token de Flow) + delegacion a runWebhookPipeline con el provider flow. La logica
// money-safety vive en el pipeline (testeada aparte); aca cubrimos el borde de auth + wiring.

// runWebhookPipeline mockeado: capturamos con que provider/notificationId lo llaman.
const runWebhookPipeline = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ ok: true }), { status: 200 }))
vi.mock('@/lib/payments/webhook-pipeline', () => ({
    runWebhookPipeline: (...a: unknown[]) => runWebhookPipeline(...a),
}))

// getPaymentsProvider('flow') → un provider fake con name flow (no debe re-consultar Flow en estos tests).
const flowProvider = { name: 'flow' as const, processWebhook: vi.fn() }
const getPaymentsProvider = vi.fn((..._a: unknown[]) => flowProvider)
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: (...a: unknown[]) => getPaymentsProvider(...a),
}))

import { POST } from './route'

const TOKEN = 'sekret-flow'
function makeReq(bodyToken?: string, urlToken = TOKEN): Request {
    const body = bodyToken != null ? new URLSearchParams({ token: bodyToken }).toString() : ''
    return new Request(`https://eva/api/payments/flow/webhook?token=${urlToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FLOW_WEBHOOK_TOKEN', TOKEN)
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/payments/flow/webhook — auth gate', () => {
    it('token de admision invalido → 401, NO delega al pipeline', async () => {
        const res = await POST(makeReq('FLW-1', 'token-malo'))
        expect(res.status).toBe(401)
        expect(runWebhookPipeline).not.toHaveBeenCalled()
    })

    it('prod SIN FLOW_WEBHOOK_TOKEN → 401 (fail-closed)', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', '')
        const res = await POST(makeReq('FLW-1', ''))
        expect(res.status).toBe(401)
        expect(runWebhookPipeline).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/flow/webhook — body + delegacion', () => {
    it('body sin token de Flow → 200 sin delegar (no reintento en loop)', async () => {
        const res = await POST(makeReq(undefined))
        expect(res.status).toBe(200)
        expect(runWebhookPipeline).not.toHaveBeenCalled()
    })

    it('token de Flow presente → delega al pipeline con provider flow + notificationId = token', async () => {
        const res = await POST(makeReq('FLW-REAL'))
        expect(res.status).toBe(200)
        expect(getPaymentsProvider).toHaveBeenCalledWith('flow')
        expect(runWebhookPipeline).toHaveBeenCalledOnce()
        const args = runWebhookPipeline.mock.calls[0][1] as { provider: { name: string }; payload: unknown; notificationId: string }
        expect(args.provider.name).toBe('flow')
        expect(args.payload).toEqual({ token: 'FLW-REAL' })
        expect(args.notificationId).toBe('FLW-REAL')
    })
})
