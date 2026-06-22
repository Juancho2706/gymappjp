import { describe, expect, it } from 'vitest'
import {
    discountSpecFromSnapshot,
    discountFloorFromSnapshot,
    isChargeableNetClp,
    MIN_CHARGEABLE_CLP,
} from './discount.service'
import { getCompositeAmountClp } from './addons.service'
import type { BillableAddon } from '@/domain/billing/types'
import type { DiscountSpec } from '@/lib/constants'

describe('discountSpecFromSnapshot — parser puro del ledger', () => {
    it('snapshot percent/total válido → spec con remainingCycles', () => {
        const spec = discountSpecFromSnapshot(
            { type: 'percent', value: 20, target: 'total' },
            3
        )
        expect(spec).toEqual({ type: 'percent', value: 20, target: 'total', remainingCycles: 3 })
    })
    it('forever (cycles null) → remainingCycles null (vigente)', () => {
        const spec = discountSpecFromSnapshot({ type: 'fixed_clp', value: 5000, target: 'base' }, null)
        expect(spec).toEqual({ type: 'fixed_clp', value: 5000, target: 'base', remainingCycles: null })
    })
    it('expirado (cycles <= 0) → null', () => {
        expect(discountSpecFromSnapshot({ type: 'percent', value: 50, target: 'total' }, 0)).toBeNull()
        expect(discountSpecFromSnapshot({ type: 'percent', value: 50, target: 'total' }, -1)).toBeNull()
    })
    it('module con moduleKeys → preserva keys', () => {
        const spec = discountSpecFromSnapshot(
            { type: 'percent', value: 50, target: 'module', moduleKeys: ['cardio'] },
            null
        )
        expect(spec).toEqual({
            type: 'percent',
            value: 50,
            target: 'module',
            moduleKeys: ['cardio'],
            remainingCycles: null,
        })
    })
    it('snapshot inválido (type/target/value malos o ausentes) → null', () => {
        expect(discountSpecFromSnapshot(null, null)).toBeNull()
        expect(discountSpecFromSnapshot('nope', null)).toBeNull()
        expect(discountSpecFromSnapshot({ type: 'free_period', value: 1, target: 'total' }, null)).toBeNull()
        expect(discountSpecFromSnapshot({ type: 'percent', value: 'x', target: 'total' }, null)).toBeNull()
        expect(discountSpecFromSnapshot({ type: 'percent', value: 10, target: 'galaxy' }, null)).toBeNull()
        expect(discountSpecFromSnapshot({ value: 10, target: 'total' }, null)).toBeNull()
    })
    it('moduleKeys vacío o no-array → omitido', () => {
        const spec = discountSpecFromSnapshot({ type: 'percent', value: 10, target: 'total', moduleKeys: [] }, null)
        expect(spec).not.toHaveProperty('moduleKeys')
    })
})

describe('discountFloorFromSnapshot', () => {
    it('floor numérico válido → redondeado', () => {
        expect(discountFloorFromSnapshot({ floorClp: 12345.6 })).toBe(12346)
    })
    it('floor ausente / inválido / negativo → undefined', () => {
        expect(discountFloorFromSnapshot({})).toBeUndefined()
        expect(discountFloorFromSnapshot({ floorClp: -5 })).toBeUndefined()
        expect(discountFloorFromSnapshot(null)).toBeUndefined()
    })
})

describe('isChargeableNetClp — guard money-safety (O1)', () => {
    it('neto >= 1 = cobrable; 0 / negativo / NaN = NO cobrable', () => {
        expect(isChargeableNetClp(1)).toBe(true)
        expect(isChargeableNetClp(39976)).toBe(true)
        expect(isChargeableNetClp(0)).toBe(false) // 100%-off → admin_grant, no path pago
        expect(isChargeableNetClp(-1)).toBe(false)
        expect(isChargeableNetClp(NaN)).toBe(false)
        expect(MIN_CHARGEABLE_CLP).toBe(1)
    })
})

describe('drift-equality — checkout == webhook == cron con el MISMO spec (invariante núcleo)', () => {
    const billable: BillableAddon[] = [
        { moduleKey: 'cardio', priceClpMensual: 9990 },
        { moduleKey: 'nutrition_exchanges', priceClpMensual: 9990 },
    ]
    it('un coach con cupón: los 3 sitios computan el MISMO neto', () => {
        const spec: DiscountSpec = { type: 'percent', value: 20, target: 'total', remainingCycles: 4 }
        // 3 call sites distintos resuelven el MISMO spec → mismo chokepoint → mismo neto.
        const atCheckout = getCompositeAmountClp('pro', 'monthly', billable, spec)
        const atWebhook = getCompositeAmountClp('pro', 'monthly', billable, spec)
        const atCron = getCompositeAmountClp('pro', 'monthly', billable, spec)
        expect(atCheckout.totalClp).toBe(atWebhook.totalClp)
        expect(atWebhook.totalClp).toBe(atCron.totalClp)
        expect(atCheckout.discountClp).toBeGreaterThan(0)
    })
    it('sin cupón (spec null): el neto estructurado == el number legacy (3-arg) → cero drift de regresión', () => {
        const legacy = getCompositeAmountClp('pro', 'monthly', billable) // number
        const structured = getCompositeAmountClp('pro', 'monthly', billable, null) // CompositeWithDiscount
        expect(structured.totalClp).toBe(legacy)
        expect(structured.discountClp).toBe(0)
        expect(structured.baseBeforeDiscountClp).toBe(legacy)
    })
})
