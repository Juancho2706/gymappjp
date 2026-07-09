import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractFlowToken, isFlowWebhookTokenValid } from './flow-webhook-authorization'

// Gate de admision del webhook Flow. Es la frontera de auth (money code): un gate mal cableado deja
// procesar payloads forjados. FLOW_WEBHOOK_TOKEN es NUESTRO secreto en `?token=`; el token del BODY es
// el de Flow para re-consultar (otro concepto).
const req = (url: string, headers?: Record<string, string>) => new Request(url, { headers })

afterEach(() => vi.unstubAllEnvs())

describe('isFlowWebhookTokenValid', () => {
    it('prod SIN FLOW_WEBHOOK_TOKEN → false (fail-closed)', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', '')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook'))).toBe(false)
    })

    it('dev SIN token seteado → true (testeo local)', () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', '')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook'))).toBe(true)
    })

    it('token seteado + ?token= coincide → true', () => {
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'sekret')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook?token=sekret'))).toBe(true)
    })

    it('token seteado + ?token= NO coincide → false', () => {
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'sekret')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook?token=otro'))).toBe(false)
    })

    it('token seteado + acepta header x-webhook-token', () => {
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'sekret')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook', { 'x-webhook-token': 'sekret' }))).toBe(true)
    })

    it('token seteado + sin candidato → false', () => {
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'sekret')
        expect(isFlowWebhookTokenValid(req('https://eva/api/payments/flow/webhook'))).toBe(false)
    })
})

describe('extractFlowToken', () => {
    it('body { token } → lo devuelve', () => {
        expect(extractFlowToken({ token: 'FLW-123' })).toBe('FLW-123')
    })
    it('token numerico → string', () => {
        expect(extractFlowToken({ token: 12345 })).toBe('12345')
    })
    it('sin token / vacio / no-objeto → null', () => {
        expect(extractFlowToken({})).toBeNull()
        expect(extractFlowToken({ token: '' })).toBeNull()
        expect(extractFlowToken(null)).toBeNull()
        expect(extractFlowToken('token=x')).toBeNull()
    })
})
