import { describe, expect, it } from 'vitest'

// El service NO toca DB ni provider: getTierUpgradeProrationClp es matemática pura (espejo EXACTO
// de getAddonProrationClp). Estos tests cubren la fracción restante del ciclo, el mínimo de 1 día
// el día del corte, el tope al ciclo completo y el corte diff<=0 → 0 (plan estrategia 06, F2).
import { getTierUpgradeProrationClp } from './addons.service'
import { getTierPriceClp, BILLING_CYCLE_CONFIG, type BillingCycle } from '@/lib/constants'

// Réplica local de la fracción del service para anclar la expectativa al MISMO redondeo
// (Math.ceil días restantes → clamp [1, totalDays] → Math.max(1, round(diff * fracción))).
const DAY_MS = 1000 * 60 * 60 * 24
function expectedProration(diffCycleClp: number, cycle: BillingCycle, now: Date, end: Date) {
    if (diffCycleClp <= 0) return 0
    const totalDays = BILLING_CYCLE_CONFIG[cycle].months * 30
    const rawRemaining = Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
    const remainingDays = Math.min(Math.max(rawRemaining, 1), totalDays)
    return Math.max(1, Math.round(diffCycleClp * (remainingDays / totalDays)))
}

describe('getTierUpgradeProrationClp — prorrateo de la DIFERENCIA de tier (espejo de getAddonProrationClp)', () => {
    it('mitad de ciclo trimestral ≈ mitad de la diferencia trimestral (starter→pro)', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // 45 días restantes / 90 = 0.5
        const diff = getTierPriceClp('pro', 'quarterly') - getTierPriceClp('starter', 'quarterly')
        // diff trimestral = round(29990*3*0.9) - round(19990*3*0.9) = 80973 - 53973 = 27000
        expect(diff).toBe(27000)
        // round(27000 * 0.5) = 13500
        expect(getTierUpgradeProrationClp('starter', 'pro', 'quarterly', now, end)).toBe(13500)
        expect(getTierUpgradeProrationClp('starter', 'pro', 'quarterly', now, end)).toBe(
            expectedProration(diff, 'quarterly', now, end)
        )
    })

    it('mitad de ciclo anual ≈ mitad de la diferencia anual (pro→elite)', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-11-28T00:00:00.000Z') // 180 días / 360 = 0.5
        const diff = getTierPriceClp('elite', 'annual') - getTierPriceClp('pro', 'annual')
        expect(getTierUpgradeProrationClp('pro', 'elite', 'annual', now, end)).toBe(
            expectedProration(diff, 'annual', now, end)
        )
        // sanity: ≈ media diferencia anual
        expect(getTierUpgradeProrationClp('pro', 'elite', 'annual', now, end)).toBe(
            Math.round(diff * 0.5)
        )
    })

    it('mensual usa totalDays = 1×30 (mitad de mes ≈ mitad de la diferencia mensual)', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-06-16T00:00:00.000Z') // 15 días / 30 = 0.5
        const diff = getTierPriceClp('elite', 'monthly') - getTierPriceClp('starter', 'monthly')
        // 44990 - 19990 = 25000 ; round(25000 * 0.5) = 12500
        expect(diff).toBe(25000)
        expect(getTierUpgradeProrationClp('starter', 'elite', 'monthly', now, end)).toBe(12500)
    })

    it('upgrade el DÍA del corte → mínimo 1 día (nunca $0)', () => {
        const now = new Date('2026-07-16T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // 0 días → se fuerza a 1
        // diff trimestral starter→pro = 27000 ; round(27000 * 1/90) = round(300) = 300
        const proration = getTierUpgradeProrationClp('starter', 'pro', 'quarterly', now, end)
        expect(proration).toBe(300)
        expect(proration).toBeGreaterThan(0)
    })

    it('upgrade justo al inicio del período (corte completo por delante) topa a la diferencia del ciclo', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-09-01T00:00:00.000Z') // ~92 días → capeado a 90
        const diff = getTierPriceClp('pro', 'quarterly') - getTierPriceClp('starter', 'quarterly')
        expect(getTierUpgradeProrationClp('starter', 'pro', 'quarterly', now, end)).toBe(diff)
    })

    it('nunca $0 ni negativo aunque el corte ya pasó (1 día mínimo)', () => {
        const now = new Date('2026-07-20T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // corte pasado → 1 día mínimo
        expect(
            getTierUpgradeProrationClp('starter', 'pro', 'annual', now, end)
        ).toBeGreaterThan(0)
    })

    it('diff <= 0 → 0: mismo tier (sin diferencia de precio)', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z')
        expect(getTierUpgradeProrationClp('pro', 'pro', 'monthly', now, end)).toBe(0)
    })

    it('diff <= 0 → 0: "downgrade" (newTier más barato) — el llamador exige > 0 antes de construir el one-shot', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z')
        // elite→starter: la diferencia de precio es negativa → 0 (no es un upgrade real).
        expect(getTierUpgradeProrationClp('elite', 'starter', 'quarterly', now, end)).toBe(0)
    })

    it('la diferencia se calcula sobre el CICLO PASADO (no convierte ciclos): annual diff ≠ monthly diff', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-12-01T00:00:00.000Z') // medio año ≈ medio ciclo anual
        const annualDiff = getTierPriceClp('pro', 'annual') - getTierPriceClp('starter', 'annual')
        const monthlyDiff = getTierPriceClp('pro', 'monthly') - getTierPriceClp('starter', 'monthly')
        // la prorrata anual parte del diff ANUAL (con su descuento), no del mensual ×12.
        expect(getTierUpgradeProrationClp('starter', 'pro', 'annual', now, end)).toBe(
            expectedProration(annualDiff, 'annual', now, end)
        )
        expect(annualDiff).not.toBe(monthlyDiff)
    })
})
