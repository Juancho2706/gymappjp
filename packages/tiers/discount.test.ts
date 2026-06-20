import { describe, expect, it } from 'vitest'
import { computeDiscountedClp, getTierPriceClp, type DiscountSpec } from './index'

// F2a (specs/discount-codes/EXECUTION-PLAN.md): motor de precio puro de cupones.
// El cupon COMPONE sobre el composite ya con descuento de ciclo (decision CEO O8).

const addons = [
    { moduleKey: 'nutrition_exchanges', cycleAmountClp: 9990 },
    { moduleKey: 'cardio', cycleAmountClp: 9990 },
]

describe('computeDiscountedClp — sin descuento', () => {
    it('spec null = composite intacto', () => {
        const r = computeDiscountedClp({ baseClp: 29990, addons, spec: null })
        expect(r.baseBeforeDiscountClp).toBe(29990 + 9990 + 9990)
        expect(r.discountClp).toBe(0)
        expect(r.netClp).toBe(49970)
    })
    it('spec expirado (remainingCycles 0) = sin descuento', () => {
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'total', remainingCycles: 0 }
        const r = computeDiscountedClp({ baseClp: 29990, addons, spec })
        expect(r.discountClp).toBe(0)
        expect(r.netClp).toBe(49970)
    })
    it('remainingCycles null (forever) = aplica', () => {
        const spec: DiscountSpec = { type: 'percent', value: 20, target: 'total', remainingCycles: null }
        const r = computeDiscountedClp({ baseClp: 10000, addons: [], spec })
        expect(r.netClp).toBe(8000)
    })
})

describe('computeDiscountedClp — percent', () => {
    it('target=total: 20% sobre base + add-ons (el caso del CEO)', () => {
        const spec: DiscountSpec = { type: 'percent', value: 20, target: 'total' }
        const r = computeDiscountedClp({ baseClp: 29990, addons, spec })
        const composite = 29990 + 9990 + 9990 // 49970
        expect(r.baseBeforeDiscountClp).toBe(composite)
        expect(r.discountClp).toBe(Math.round(composite * 0.2)) // 9994
        expect(r.netClp).toBe(composite - Math.round(composite * 0.2)) // 39976
    })
    it('target=base: 50% solo sobre el plan, add-ons intactos', () => {
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'base' }
        const r = computeDiscountedClp({ baseClp: 30000, addons, spec })
        expect(r.discountClp).toBe(15000) // 50% de 30000
        expect(r.netClp).toBe(30000 - 15000 + 9990 + 9990) // 34980
    })
    it('target=module: 50% solo sobre el modulo indicado', () => {
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'module', moduleKeys: ['cardio'] }
        const r = computeDiscountedClp({ baseClp: 30000, addons, spec })
        expect(r.discountClp).toBe(4995) // 50% de 9990 (cardio)
        expect(r.netClp).toBe(30000 + 9990 + 9990 - 4995)
    })
    it('target=module sin add-on que matchee = no-op (discount 0)', () => {
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'module', moduleKeys: ['body_composition'] }
        const r = computeDiscountedClp({ baseClp: 30000, addons, spec })
        expect(r.discountClp).toBe(0)
        expect(r.netClp).toBe(r.baseBeforeDiscountClp)
    })
    it('100% sobre total → neto 0 (lo rechaza el path pago, O1)', () => {
        const spec: DiscountSpec = { type: 'percent', value: 100, target: 'total' }
        const r = computeDiscountedClp({ baseClp: 30000, addons: [], spec })
        expect(r.netClp).toBe(0)
        expect(r.discountClp).toBe(30000)
    })
    it('percent fuera de rango se clampea a 0..100', () => {
        const over = computeDiscountedClp({ baseClp: 1000, addons: [], spec: { type: 'percent', value: 150, target: 'total' } })
        expect(over.netClp).toBe(0)
        const under = computeDiscountedClp({ baseClp: 1000, addons: [], spec: { type: 'percent', value: -10, target: 'total' } })
        expect(under.netClp).toBe(1000)
    })
})

describe('computeDiscountedClp — fixed_clp', () => {
    it('target=base: descuento fijo sobre el plan', () => {
        const spec: DiscountSpec = { type: 'fixed_clp', value: 5000, target: 'base' }
        const r = computeDiscountedClp({ baseClp: 30000, addons, spec })
        expect(r.discountClp).toBe(5000)
        expect(r.netClp).toBe(30000 - 5000 + 9990 + 9990)
    })
    it('fixed_clp > target → clampea al target (neto del componente = 0, total no negativo)', () => {
        const spec: DiscountSpec = { type: 'fixed_clp', value: 999999, target: 'base' }
        const r = computeDiscountedClp({ baseClp: 30000, addons, spec })
        expect(r.discountClp).toBe(30000) // no descuenta mas que la base
        expect(r.netClp).toBe(9990 + 9990) // add-ons intactos
    })
    it('fixed_clp target=total > composite → neto 0', () => {
        const spec: DiscountSpec = { type: 'fixed_clp', value: 999999, target: 'total' }
        const r = computeDiscountedClp({ baseClp: 30000, addons: [], spec })
        expect(r.netClp).toBe(0)
    })
})

describe('computeDiscountedClp — compone con descuento de ciclo (O8)', () => {
    it('20% sobre el plan anual ya descontado (compone)', () => {
        // pro anual = 29990*12*0.8 = round = 287904
        const annualBase = getTierPriceClp('pro', 'annual')
        const spec: DiscountSpec = { type: 'percent', value: 20, target: 'total' }
        const r = computeDiscountedClp({ baseClp: annualBase, addons: [], spec })
        // compone: 20% sobre el anual ya con -20% → neto = annualBase * 0.8
        expect(r.netClp).toBe(annualBase - Math.round(annualBase * 0.2))
        expect(r.baseBeforeDiscountClp).toBe(annualBase)
    })
})
