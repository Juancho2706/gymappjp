import { describe, expect, it } from 'vitest'
import { getTierPriceClp } from '@/lib/constants'
import {
    computeReactivatePrice,
    reactivateDiscountLabel,
    type ReactivateActiveDiscount,
} from './reactivate-price'

// Caso real que motivó el cambio (owner 2026-09-02): coach bloqueada con un cupón 50 % forever
// vivo. La página pintaba el precio de LISTA y el neto recién aparecía en el checkout.
const PERCENT_50_TOTAL: ReactivateActiveDiscount = {
    code: 'JHNG3C48AE',
    type: 'percent',
    value: 50,
    target: 'total',
    remainingCycles: null,
}

describe('computeReactivatePrice', () => {
    it('sin cupón devuelve lista == neto y descuento 0 (la UI no muestra tachado)', () => {
        const list = getTierPriceClp('pro', 'monthly')
        const view = computeReactivatePrice(list, null)
        expect(view).toEqual({ listClp: list, netClp: list, discountClp: 0 })
    })

    it('percent 50 target=total: el Pro mensual de lista se muestra a la mitad', () => {
        const list = getTierPriceClp('pro', 'monthly')
        const view = computeReactivatePrice(list, PERCENT_50_TOTAL)
        expect(view.listClp).toBe(list)
        expect(view.netClp).toBe(Math.round(list / 2))
        expect(view.discountClp).toBe(list - Math.round(list / 2))
        // Anclaje del caso real: $29.990 de lista → $14.995 cobrados.
        expect(list).toBe(29990)
        expect(view.netClp).toBe(14995)
    })

    it('percent 50 target=base descuenta igual (la pantalla precia solo el plan base)', () => {
        const list = getTierPriceClp('pro', 'monthly')
        const view = computeReactivatePrice(list, { ...PERCENT_50_TOTAL, target: 'base' })
        expect(view.netClp).toBe(14995)
    })

    it('target=module NO toca el precio del plan (no hay add-ons en esta pantalla)', () => {
        const list = getTierPriceClp('pro', 'monthly')
        const view = computeReactivatePrice(list, { ...PERCENT_50_TOTAL, target: 'module' })
        expect(view).toEqual({ listClp: list, netClp: list, discountClp: 0 })
    })

    it('fixed_clp descuenta el monto y nunca deja el neto bajo cero', () => {
        expect(
            computeReactivatePrice(29990, { code: 'X', type: 'fixed_clp', value: 5000, target: 'total', remainingCycles: null })
        ).toEqual({ listClp: 29990, netClp: 24990, discountClp: 5000 })
        expect(
            computeReactivatePrice(29990, { code: 'X', type: 'fixed_clp', value: 99999, target: 'total', remainingCycles: null })
        ).toEqual({ listClp: 29990, netClp: 0, discountClp: 29990 })
    })

    it('cupón con ciclos agotados no descuenta (mismo corte que el motor de cobro)', () => {
        const list = getTierPriceClp('pro', 'monthly')
        expect(computeReactivatePrice(list, { ...PERCENT_50_TOTAL, remainingCycles: 0 })).toEqual({
            listClp: list,
            netClp: list,
            discountClp: 0,
        })
    })

    it('respeta el ciclo elegido: el anual descuenta sobre el total del período', () => {
        const annual = getTierPriceClp('pro', 'annual')
        const view = computeReactivatePrice(annual, PERCENT_50_TOTAL)
        expect(view.netClp).toBe(Math.round(annual / 2))
    })
})

describe('reactivateDiscountLabel', () => {
    it('percent forever: porcentaje + código, sin ciclos', () => {
        expect(reactivateDiscountLabel(PERCENT_50_TOTAL, 14995)).toBe('−50% · tu cupón JHNG3C48AE')
    })

    it('percent con ciclos restantes agrega «por N ciclos»', () => {
        expect(reactivateDiscountLabel({ ...PERCENT_50_TOTAL, remainingCycles: 3 }, 14995)).toBe(
            '−50% · tu cupón JHNG3C48AE · por 3 ciclos'
        )
        expect(reactivateDiscountLabel({ ...PERCENT_50_TOTAL, remainingCycles: 1 }, 14995)).toBe(
            '−50% · tu cupón JHNG3C48AE · por 1 ciclo'
        )
    })

    it('fixed_clp muestra el descuento EFECTIVO en formato es-CL', () => {
        expect(
            reactivateDiscountLabel(
                { code: 'PROMO', type: 'fixed_clp', value: 5000, target: 'total', remainingCycles: null },
                5000
            )
        ).toBe('−$5.000 · tu cupón PROMO')
    })

    it('sin código no inventa uno', () => {
        expect(reactivateDiscountLabel({ ...PERCENT_50_TOTAL, code: null }, 14995)).toBe(
            '−50% · tu descuento'
        )
    })
})
