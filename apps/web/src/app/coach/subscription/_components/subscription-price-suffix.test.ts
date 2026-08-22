import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
    BILLING_CYCLE_PRICE_SUFFIX,
    getDefaultBillingCycleForTier,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'

/**
 * W5.4 del embudo Free→Pro. La card de «Cambiar plan» pinta `getTierPriceClp(tier, ciclo)`, que
 * devuelve el TOTAL del período — y el sufijo estaba escrito a mano como «/mes». Con el ciclo
 * Anual seleccionado, la card de Pro leía «$287.904 /mes»: el total del año presentado como
 * mensualidad. Un coach que decide con ese número decide con un precio falso.
 *
 * Este test ata las dos mitades: la aritmética (qué devuelve el helper) y el markup (qué sufijo
 * pinta la card). Renderizar `SubscriptionContent` entero exigiría montar coach + suscripción +
 * add-ons + MercadoPago; el guard de archivo cubre la regresión exacta a costo cero.
 */
const SUBSCRIPTION_CONTENT = readFileSync(join(__dirname, 'SubscriptionContent.tsx'), 'utf-8')

describe('card de «Cambiar plan» — el sufijo del precio sigue al ciclo', () => {
    it('el sufijo ya no está hardcodeado en el markup', () => {
        expect(SUBSCRIPTION_CONTENT).not.toContain('text-muted"> /mes<')
        expect(SUBSCRIPTION_CONTENT).toContain('BILLING_CYCLE_PRICE_SUFFIX[priceCycle]')
    })

    it('el sufijo se deriva del MISMO ciclo con el que se calculó el precio', () => {
        // Si el markup volviera a usar `selectedCycle` en vez de `priceCycle`, un tier sin ese ciclo
        // (free) mostraría un sufijo que no corresponde al número de al lado.
        expect(SUBSCRIPTION_CONTENT).toContain('const price = getTierPriceClp(tier, priceCycle)')
    })

    it('con Anual, Pro muestra el total del año con «/año» (no «/mes»)', () => {
        const tier: SaleTier = 'pro'
        const selectedCycle: BillingCycle = 'annual'
        const priceCycle = isBillingCycleAllowedForTier(tier, selectedCycle)
            ? selectedCycle
            : getDefaultBillingCycleForTier(tier)
        const price = getTierPriceClp(tier, priceCycle)

        expect(priceCycle).toBe('annual')
        expect(BILLING_CYCLE_PRICE_SUFFIX[priceCycle]).toBe('/año')
        // El número que acompaña al sufijo es el total del año: > 9 mensualidades (12 −20 %).
        expect(price).toBeGreaterThan(getTierPriceClp(tier, 'monthly') * 9)
    })

    it('free no admite ciclos: cae al default y el sufijo sigue siendo coherente', () => {
        const priceCycle = isBillingCycleAllowedForTier('free', 'annual')
            ? 'annual'
            : getDefaultBillingCycleForTier('free')
        expect(BILLING_CYCLE_PRICE_SUFFIX[priceCycle]).toBe('/mes')
        expect(getTierPriceClp('free', priceCycle)).toBe(0)
    })
})
