import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CheckoutPlanTicket } from './CheckoutPlanTicket'
import { MpCheckoutRescueCard } from './MpCheckoutRescueCard'
import { PaymentMethodPicker } from './PaymentMethodPicker'

/**
 * Caso Cristóbal (23-09): el botón grande llevaba a Mercado Pago y nada decía qué tarjeta servía;
 * los 6 coaches que pagan por Flow usan Redcompra/prepago. Lo que no puede volver:
 *   1. Webpay deja de ir PRIMERO o deja de venir elegido;
 *   2. desaparecen las tarjetas que acepta Webpay;
 *   3. el selector deja de ser radios nativos (teclado / lector de pantalla).
 */
const noop = () => {}

/** Radios en orden de aparición: su `value` y si vienen marcados (el orden de atributos no importa). */
function radios(markup: string) {
    return (markup.match(/<input[^>]*type="radio"[^>]*>/g) ?? []).map((tag) => ({
        value: /value="([^"]*)"/.exec(tag)?.[1],
        checked: /\schecked=""/.test(tag),
    }))
}

describe('PaymentMethodPicker', () => {
    const markup = renderToStaticMarkup(<PaymentMethodPicker value="flow" onChange={noop} />)

    it('Webpay va primero y viene elegido', () => {
        expect(radios(markup)).toEqual([
            { value: 'flow', checked: true },
            { value: 'mercadopago', checked: false },
        ])
    })

    it('dice qué tarjetas acepta Webpay', () => {
        for (const card of ['Redcompra', 'Visa', 'Mastercard', 'Prepago']) {
            expect(markup).toContain(card)
        }
        expect(markup).toContain('Débito, crédito o prepago')
    })

    it('es un grupo de radios con leyenda', () => {
        expect(markup).toContain('<fieldset')
        expect(markup).toContain('¿Cómo quieres pagar?')
        expect(radios(markup)).toHaveLength(2)
    })

    it('respeta la elección de Mercado Pago', () => {
        const mp = renderToStaticMarkup(<PaymentMethodPicker value="mercadopago" onChange={noop} />)
        expect(radios(mp)).toEqual([
            { value: 'flow', checked: false },
            { value: 'mercadopago', checked: true },
        ])
    })
})

describe('CheckoutPlanTicket', () => {
    it('muestra plan, monto con su sufijo y lo que se gana', () => {
        const markup = renderToStaticMarkup(
            <CheckoutPlanTicket overline="Pro · Mensual" amountClp={29990} priceSuffix="/mes" maxClients={25} withoutEvaBadge />
        )
        expect(markup).toContain('Pro · Mensual')
        expect(markup).toContain('$29.990')
        expect(markup).toContain('/mes')
        expect(markup).toContain('Hasta 25 alumnos')
        expect(markup).toContain('Tu marca, sin sello EVA')
    })

    it('tacha el precio sin cupón y no inventa beneficios que no vienen', () => {
        const markup = renderToStaticMarkup(
            <CheckoutPlanTicket overline="Pro · Anual" amountClp={143952} originalAmountClp={287904} priceSuffix="/año" />
        )
        expect(markup).toContain('line-through')
        expect(markup).toContain('$287.904')
        expect(markup).not.toContain('alumnos')
        expect(markup).not.toContain('sello')
    })
})

describe('MpCheckoutRescueCard', () => {
    it('ofrece Webpay con el plan elegido y deja reintentar Mercado Pago', () => {
        const markup = renderToStaticMarkup(
            <MpCheckoutRescueCard
                planLabel="Pro · Mensual"
                amountClp={29990}
                priceSuffix="/mes"
                busy={false}
                onPayWithFlow={noop}
                onRetryMp={noop}
                onDismiss={noop}
            />
        )
        expect(markup).toContain('¿No pudiste terminar en Mercado Pago?')
        expect(markup).toContain('Pro · Mensual sigue elegido')
        expect(markup).toContain('Pagar con Webpay')
        expect(markup).toContain('Reintentar con Mercado Pago')
        expect(markup).toContain('aria-label="Cerrar aviso"')
    })
})
