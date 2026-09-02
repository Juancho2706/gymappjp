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
 * Este test cubre la mitad ARITMÉTICA (qué devuelve el helper). La otra mitad —qué sufijo pinta
 * la card, y que salga del MISMO ciclo con el que se calculó el precio— dejó de afirmarse leyendo
 * el fuente como texto: vive en la regla eslint `local/subscription-price-suffix`
 * (tools/eslint-rules/), que corre en `pnpm lint` sobre `SubscriptionContent.tsx`.
 */

describe('card de «Cambiar plan» — el sufijo del precio sigue al ciclo', () => {
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
