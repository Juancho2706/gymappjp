import { describe, expect, it } from 'vitest'
import { buildPaymentFailedEmail } from './payment-dunning-templates'

const BASE = {
    coachName: 'MDR',
    accessUntil: '1 de noviembre de 2026',
    updateCardUrl: 'https://www.eva-app.cl/coach/subscription/update-card',
}

describe('buildPaymentFailedEmail', () => {
    it('coach Flow: habla de Webpay, nunca de Mercado Pago, y el botón va a cambiar la tarjeta', () => {
        const { html } = buildPaymentFailedEmail({ ...BASE, provider: 'flow' })
        expect(html).not.toContain('Mercado Pago')
        expect(html).toContain('Webpay')
        expect(html).toContain('Cambiar mi tarjeta')
        expect(html).toContain('/coach/subscription/update-card')
        expect(html).toContain('1 de noviembre de 2026')
    })

    it('coach MP: conserva el aviso del reintento automático y apunta a update-card', () => {
        const { html } = buildPaymentFailedEmail({ ...BASE, provider: 'mercadopago' })
        expect(html).toContain('Mercado Pago reintentará')
        expect(html).toContain('Actualizar mi tarjeta')
        expect(html).toContain('/coach/subscription/update-card')
    })

    it('sin fecha de acceso: no inventa una', () => {
        const flow = buildPaymentFailedEmail({ ...BASE, accessUntil: null, provider: 'flow' }).html
        const mp = buildPaymentFailedEmail({ ...BASE, accessUntil: null, provider: 'mercadopago' }).html
        expect(flow).not.toContain('Conservas el acceso')
        expect(mp).not.toContain('Conservas el acceso')
    })
})
