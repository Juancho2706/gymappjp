import { describe, expect, it } from 'vitest'
import {
    CHECKOUT_SUPPORT_EMAIL,
    GATEWAY_PAYER_SITE_MISMATCH,
    resolveCheckoutError,
    type CheckoutErrorAction,
} from './checkout-errors'

// Función PURA del copy del checkout: traduce el `code`/`error` del server a un mensaje accionable.
// La regla dura: NADA crudo del gateway llega al coach, y los códigos de negocio conservan el
// mensaje del server (lleva los números reales del caso).

function kinds(actions: CheckoutErrorAction[]): string[] {
    return actions.map((a) => a.kind)
}

const RAW_MP_400 =
    'MercadoPago subscription creation failed (400) [x-request-id: cfb8b64f-5359-4bf8-aa91-7e38dfbc570e]: ' +
    '{"message":"Payer is associated with a different site","code":"guest_site_mismatch","status":400}'

describe('resolveCheckoutError — pagador de otro site (el fallo real del 25-08)', () => {
    it('mapea el code canónico del server a la frase aprobada', () => {
        const copy = resolveCheckoutError({ code: GATEWAY_PAYER_SITE_MISMATCH })
        expect(copy.code).toBe(GATEWAY_PAYER_SITE_MISMATCH)
        expect(copy.message).toBe(
            'MercadoPago no pudo procesar tu suscripción porque tu cuenta de MP está asociada a otro país.'
        )
        expect(copy.hint).toContain('No se te cobró nada')
    })

    it('acepta también el code crudo del gateway (`guest_site_mismatch`)', () => {
        expect(resolveCheckoutError({ code: 'guest_site_mismatch' }).code).toBe(GATEWAY_PAYER_SITE_MISMATCH)
    })

    it('lo detecta en el texto crudo del 500 aunque el server no lo haya mapeado', () => {
        const copy = resolveCheckoutError({ code: 'http_500', message: RAW_MP_400 })
        expect(copy.code).toBe(GATEWAY_PAYER_SITE_MISMATCH)
        // Y el JSON con el x-request-id NO llega al coach por ninguna vía.
        expect(copy.message).not.toContain('x-request-id')
        expect(copy.message).not.toContain('guest_site_mismatch')
        expect(copy.hint).not.toContain('x-request-id')
    })

    it('ofrece reintentar y escribirnos siempre; Webpay solo si el backend lo soporta', () => {
        const sinFlow = resolveCheckoutError({ code: GATEWAY_PAYER_SITE_MISMATCH })
        expect(kinds(sinFlow.actions)).toEqual(['retry', 'contact'])

        const conFlow = resolveCheckoutError({ code: GATEWAY_PAYER_SITE_MISMATCH, flowAvailable: true })
        expect(kinds(conFlow.actions)).toEqual(['try_flow', 'retry', 'contact'])
    })
})

describe('resolveCheckoutError — códigos de negocio conservan el mensaje del server', () => {
    it('OVER_CAPACITY mantiene los números reales que mandó el server', () => {
        const serverMessage = 'Ese plan permite hasta 25 alumnos y tienes 31. Archiva alumnos antes de bajar de plan.'
        const copy = resolveCheckoutError({ code: 'OVER_CAPACITY', message: serverMessage })
        expect(copy.message).toBe(serverMessage)
    })

    it('OVER_CAPACITY no ofrece reintentar (reintentar no cambia nada)', () => {
        const copy = resolveCheckoutError({ code: 'OVER_CAPACITY', message: 'x' })
        expect(copy.actions).toEqual([])
    })

    it('cae al fallback escrito cuando el server no mandó mensaje', () => {
        const copy = resolveCheckoutError({ code: 'NUTRITION_ADDON_ON_DOWNGRADE' })
        expect(copy.message).toContain('Nutrición')
    })

    it('los transitorios (GATEWAY_SWITCH_PENDING) sí ofrecen reintentar', () => {
        const copy = resolveCheckoutError({ code: 'GATEWAY_SWITCH_PENDING', message: 'Intenta de nuevo.' })
        expect(kinds(copy.actions)).toEqual(['retry', 'contact'])
    })

    it('GATEWAY_EMAIL_REJECTED conserva el mensaje del server y ofrece salida', () => {
        const serverMessage = 'El medio de pago no pudo validar tu correo.'
        const copy = resolveCheckoutError({ code: 'GATEWAY_EMAIL_REJECTED', message: serverMessage })
        expect(copy.message).toBe(serverMessage)
        expect(kinds(copy.actions)).toContain('retry')
    })
})

describe('resolveCheckoutError — desconocido', () => {
    it('nunca pinta el texto crudo del server', () => {
        const copy = resolveCheckoutError({ code: 'http_500', message: 'TypeError: fetch failed at Object.<anonymous>' })
        expect(copy.code).toBe('http_500')
        expect(copy.message).toBe('No pudimos iniciar el cobro de tu plan.')
        expect(copy.message).not.toContain('TypeError')
    })

    it('sin code ni mensaje (red caída) sigue devolviendo copy usable', () => {
        const copy = resolveCheckoutError({})
        expect(copy.code).toBe('unknown')
        expect(copy.title).toBe('No pudimos iniciar el cobro')
        expect(kinds(copy.actions)).toEqual(['retry', 'contact'])
    })

    it('ofrece Webpay como plan B cuando el backend lo soporta', () => {
        expect(kinds(resolveCheckoutError({ flowAvailable: true }).actions)).toEqual([
            'retry',
            'try_flow',
            'contact',
        ])
    })
})

describe('resolveCheckoutError — la acción de contacto', () => {
    it('es un mailto al buzón de soporte con el código de referencia en el cuerpo', () => {
        const copy = resolveCheckoutError({ code: GATEWAY_PAYER_SITE_MISMATCH })
        const contact = copy.actions.find((a) => a.kind === 'contact')
        expect(contact).toBeDefined()
        const href = contact && contact.kind === 'contact' ? contact.href : ''
        expect(href.startsWith(`mailto:${CHECKOUT_SUPPORT_EMAIL}?`)).toBe(true)
        expect(decodeURIComponent(href)).toContain(GATEWAY_PAYER_SITE_MISMATCH)
    })
})
