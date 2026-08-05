import { describe, expect, it } from 'vitest'
import { listMonthlyEquivalentClp, netMonthlyClpForCoach } from './mrr.service'
import type { DiscountSpec } from '@/lib/constants'

// Casos anclados a cobros REALES de billing_snapshots (2026-08): la formula debe
// reproducir exactamente lo que la pasarela cobro, no una aproximacion.
describe('netMonthlyClpForCoach', () => {
    const pct = (value: number): DiscountSpec => ({ type: 'percent', value, target: 'total', remainingCycles: null })

    it('sin cupon: pro monthly = precio de lista', () => {
        expect(netMonthlyClpForCoach('pro', 'monthly', null)).toBe(29990)
    })

    it('DIEGO25 (-25% total forever): 29990 - round(7497.5) = 22492 (cobro real)', () => {
        expect(netMonthlyClpForCoach('pro', 'monthly', pct(25))).toBe(22492)
    })

    it('-50% total forever: 14995 (cobro real movida)', () => {
        expect(netMonthlyClpForCoach('pro', 'monthly', pct(50))).toBe(14995)
    })

    it('fixed_clp resta con piso 0', () => {
        expect(netMonthlyClpForCoach('pro', 'monthly', { type: 'fixed_clp', value: 5000, target: 'total', remainingCycles: null })).toBe(24990)
        expect(netMonthlyClpForCoach('starter', 'monthly', { type: 'fixed_clp', value: 999999, target: 'total', remainingCycles: null })).toBe(0)
    })

    it('target module NO descuenta la base', () => {
        expect(netMonthlyClpForCoach('pro', 'monthly', { type: 'percent', value: 100, target: 'module', remainingCycles: null })).toBe(29990)
    })

    it('ciclo trimestral (-10%) mensualiza: pro = round(80973/3) = 26991; con -25% = round(60730/3)', () => {
        // cycle = round(29990*3*0.9) = 80973
        expect(netMonthlyClpForCoach('pro', 'quarterly', null)).toBe(26991)
        // 80973 - round(20243.25) = 60730 → /3 = 20243.33 → 20243
        expect(netMonthlyClpForCoach('pro', 'quarterly', pct(25))).toBe(20243)
    })

    it('ciclo anual (-20%) mensualiza: elite = round(431904/12) = 35992', () => {
        expect(netMonthlyClpForCoach('elite', 'annual', null)).toBe(35992)
    })

    it('tier desconocido o free = 0', () => {
        expect(netMonthlyClpForCoach(null, 'monthly', pct(25))).toBe(0)
        expect(netMonthlyClpForCoach('free', 'monthly', null)).toBe(0)
    })
})

describe('listMonthlyEquivalentClp', () => {
    it('mensualiza el descuento de ciclo sin cupon', () => {
        expect(listMonthlyEquivalentClp('pro', 'monthly')).toBe(29990)
        expect(listMonthlyEquivalentClp('pro', 'quarterly')).toBe(26991)
        expect(listMonthlyEquivalentClp('pro', null)).toBe(29990)
    })
})
