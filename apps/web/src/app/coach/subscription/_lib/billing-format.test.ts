import { describe, it, expect } from 'vitest'
import {
    describeSubscriptionEvent,
    extractAmountClpFromEventPayload,
    isInternalSubscriptionEvent,
    mpBrandLabel,
} from './billing-format'

/**
 * Golden master del slice 1 (Fase 2). Pinea el comportamiento EXACTO de las dos funciones
 * puras extraídas verbatim de page.tsx, para garantizar que el split es behavior-preserving
 * y como red de seguridad de los slices posteriores del archivo de suscripción.
 * Son los dos doNotTouch del archivo: el label de marca y el parser de monto del historial.
 */

describe('mpBrandLabel', () => {
    it('mapea cada id conocido a su etiqueta legible', () => {
        expect(mpBrandLabel('visa')).toBe('Visa')
        expect(mpBrandLabel('debvisa')).toBe('Visa débito')
        expect(mpBrandLabel('master')).toBe('Mastercard')
        expect(mpBrandLabel('debmaster')).toBe('Mastercard débito')
        expect(mpBrandLabel('amex')).toBe('American Express')
        expect(mpBrandLabel('diners')).toBe('Diners')
        expect(mpBrandLabel('maestro')).toBe('Maestro')
        expect(mpBrandLabel('magna')).toBe('Magna')
        expect(mpBrandLabel('naranja')).toBe('Naranja')
        expect(mpBrandLabel('cabal')).toBe('Cabal')
    })

    it('es case-insensitive (toLowerCase)', () => {
        expect(mpBrandLabel('VISA')).toBe('Visa')
        expect(mpBrandLabel('DebMaster')).toBe('Mastercard débito')
    })

    it('id desconocido: primera letra mayúscula + resto verbatim', () => {
        expect(mpBrandLabel('foo')).toBe('Foo')
        expect(mpBrandLabel('x')).toBe('X')
        expect(mpBrandLabel('redcompra')).toBe('Redcompra')
    })

    it('nulo / undefined / vacío → cadena vacía', () => {
        expect(mpBrandLabel(null)).toBe('')
        expect(mpBrandLabel(undefined)).toBe('')
        expect(mpBrandLabel('')).toBe('')
    })
})

describe('extractAmountClpFromEventPayload', () => {
    it('lee transaction_amount numérico de nivel raíz', () => {
        expect(extractAmountClpFromEventPayload({ transaction_amount: 12990 })).toBe(12990)
    })

    it('parsea string y redondea', () => {
        expect(extractAmountClpFromEventPayload({ transaction_amount: '12990.0' })).toBe(12990)
        expect(extractAmountClpFromEventPayload({ transaction_amount: '12990.6' })).toBe(12991)
    })

    it('lee anidado en auto_recurring y en data', () => {
        expect(extractAmountClpFromEventPayload({ auto_recurring: { transaction_amount: 9990 } })).toBe(9990)
        expect(extractAmountClpFromEventPayload({ data: { transaction_amount: 5990 } })).toBe(5990)
    })

    it('precedencia: raíz > auto_recurring > data (primer candidato válido)', () => {
        expect(
            extractAmountClpFromEventPayload({ transaction_amount: 100, auto_recurring: { transaction_amount: 200 }, data: { transaction_amount: 300 } })
        ).toBe(100)
        // raíz inválida (0) cae al siguiente candidato válido
        expect(
            extractAmountClpFromEventPayload({ transaction_amount: 0, auto_recurring: { transaction_amount: 200 } })
        ).toBe(200)
        expect(
            extractAmountClpFromEventPayload({ auto_recurring: { transaction_amount: 0 }, data: { transaction_amount: 300 } })
        ).toBe(300)
    })

    it('monto <= 0 o NaN → null', () => {
        expect(extractAmountClpFromEventPayload({ transaction_amount: 0 })).toBeNull()
        expect(extractAmountClpFromEventPayload({ transaction_amount: -5 })).toBeNull()
        expect(extractAmountClpFromEventPayload({ transaction_amount: 'abc' })).toBeNull()
    })

    it('payload nulo / no-objeto / sin monto → null', () => {
        expect(extractAmountClpFromEventPayload(null)).toBeNull()
        expect(extractAmountClpFromEventPayload(undefined)).toBeNull()
        expect(extractAmountClpFromEventPayload(12990)).toBeNull()
        expect(extractAmountClpFromEventPayload('12990')).toBeNull()
        expect(extractAmountClpFromEventPayload({})).toBeNull()
        expect(extractAmountClpFromEventPayload({ foo: 'bar' })).toBeNull()
    })
})

describe('historial de pagos en lenguaje del coach', () => {
    it('oculta las marcas internas, empezando por el intento de checkout', () => {
        expect(isInternalSubscriptionEvent('flow_checkout_intent')).toBe(true)
        expect(isInternalSubscriptionEvent('mercadopago_checkout_intent')).toBe(true)
        expect(isInternalSubscriptionEvent('superseded_by_mp')).toBe(true)
        expect(isInternalSubscriptionEvent('superseded_by_reenrollment')).toBe(true)
        expect(isInternalSubscriptionEvent('orphan_persist_failed')).toBe(true)
        expect(isInternalSubscriptionEvent('card_change_pending')).toBe(true)
        expect(isInternalSubscriptionEvent('approved')).toBe(false)
        expect(isInternalSubscriptionEvent(null)).toBe(false)
    })

    it('traduce los estados reales y el medio de pago', () => {
        expect(describeSubscriptionEvent({ provider_status: 'approved', provider: 'mercadopago' })).toEqual({
            label: 'Pago aprobado',
            tone: 'success',
            source: 'Mercado Pago',
        })
        expect(describeSubscriptionEvent({ provider_status: 'authorized', provider: 'flow' })).toEqual({
            label: 'Suscripción activada',
            tone: 'success',
            source: 'Webpay (Flow)',
        })
        expect(describeSubscriptionEvent({ provider_status: 'rejected', provider: 'mercadopago' }).tone).toBe('danger')
        expect(describeSubscriptionEvent({ provider_status: 'cancelled', provider: 'mercadopago' }).label).toBe(
            'Suscripción cancelada'
        )
    })

    it('activar el plan Free no se presenta como un cobro de Mercado Pago', () => {
        expect(describeSubscriptionEvent({ provider_status: 'active', provider: 'mercadopago' })).toEqual({
            label: 'Plan Free activado',
            tone: 'neutral',
            source: null,
        })
    })

    it('un estado desconocido nunca se pinta crudo ni con check verde', () => {
        const view = describeSubscriptionEvent({ provider_status: 'algo_nuevo_del_gateway', provider: 'flow' })
        expect(view.label).toBe('Movimiento de suscripción')
        expect(view.tone).toBe('neutral')
        expect(describeSubscriptionEvent({ provider_status: null, provider: 'flow' }).label).toBe(
            'Movimiento de suscripción'
        )
    })
})
