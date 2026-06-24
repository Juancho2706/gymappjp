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

describe('computeDiscountedClp — 50% forever (cupon JHNG3C48AE) nunca pasa del 50% en ningun ciclo', () => {
    // Espejo del cupon real: percent 50, target=total, forever. Confirma que en mensual/trim/anual
    // el descuento es exactamente round(composite*0.5) y JAMAS supera la mitad del total (tope duro).
    const spec: DiscountSpec = { type: 'percent', value: 50, target: 'total', remainingCycles: null }
    for (const cycle of ['monthly', 'quarterly', 'annual'] as const) {
        it(`${cycle}: neto = composite - round(composite*0.5), descuento <= ceil(composite/2)`, () => {
            const base = getTierPriceClp('pro', cycle)
            const r = computeDiscountedClp({ baseClp: base, addons, spec })
            const composite = base + 9990 + 9990
            expect(r.baseBeforeDiscountClp).toBe(composite)
            expect(r.netClp).toBe(composite - Math.round(composite * 0.5))
            // tope duro: el descuento no supera la mitad del total (a lo sumo redondea 0.5 peso hacia arriba).
            expect(r.discountClp).toBeLessThanOrEqual(Math.ceil(composite / 2))
            expect(r.discountClp).toBe(composite - r.netClp)
        })
    }
})

describe('computeDiscountedClp — margin floor configurable (O8)', () => {
    it('50% + anual clampea al floor cuando el floor supera el neto descontado', () => {
        // pro anual = 287904; 50% → neto natural 143952. Floor 150000 > 143952 → clampea al floor.
        const annualBase = getTierPriceClp('pro', 'annual')
        const naturalNet = annualBase - Math.round(annualBase * 0.5)
        const floorClp = naturalNet + 6048 // 150000 para pro anual; > neto natural
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'total' }
        const r = computeDiscountedClp({ baseClp: annualBase, addons: [], spec, floorClp })
        expect(r.netClp).toBe(floorClp) // neto clampeado al piso de margen
        expect(r.discountClp).toBe(annualBase - floorClp) // descuento recalculado desde el neto
    })
    it('descuento profundo (90%) clampea al floor en vez de caer casi a 0', () => {
        const spec: DiscountSpec = { type: 'percent', value: 90, target: 'total' }
        const r = computeDiscountedClp({ baseClp: 30000, addons: [], spec, floorClp: 25000 })
        // natural = 30000 - 27000 = 3000; floor 25000 lo levanta
        expect(r.netClp).toBe(25000)
        expect(r.discountClp).toBe(5000)
    })
    it('floor por debajo del neto natural = no-op (comportamiento historico)', () => {
        const spec: DiscountSpec = { type: 'percent', value: 20, target: 'total' }
        const sinFloor = computeDiscountedClp({ baseClp: 10000, addons: [], spec })
        const conFloorBajo = computeDiscountedClp({ baseClp: 10000, addons: [], spec, floorClp: 1000 })
        expect(conFloorBajo.netClp).toBe(sinFloor.netClp) // 8000, el floor 1000 no muerde
    })
    it('floor mayor que el composite no sube el precio (clamp a composite)', () => {
        const spec: DiscountSpec = { type: 'percent', value: 50, target: 'total' }
        const r = computeDiscountedClp({ baseClp: 10000, addons: [], spec, floorClp: 999999 })
        expect(r.netClp).toBe(10000) // nunca cobra mas que el composite
        expect(r.discountClp).toBe(0)
    })
})
