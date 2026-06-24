import { getPaymentsProvider } from '@/lib/payments/provider'
import type { PaymentsProvider } from '@/lib/payments/types'
import type { AddonPaymentsPort } from '@/services/billing/addons.service'

/**
 * Adaptador del `AddonPaymentsPort` (puerto estrecho que consume `addons.service`) sobre el
 * `PaymentsProvider` del sistema (plan 05 F4).
 *
 * Las ops `updateCheckoutAmount` (PUT del monto del preapproval) y `createOneShotPayment`
 * (Checkout Pro one-shot prorrateado) las IMPLEMENTA F3 en el provider MP
 * (`lib/payments/providers/mercadopago.ts`, ver "Archivos clave" del plan). Mientras F3 no
 * haya extendido la interface `PaymentsProvider`, este adaptador las lee de forma opcional
 * (cast a la forma extendida) y, si aún no existen en runtime, lanza un error claro.
 *
 * Esto NO compromete a producción: el lanzamiento de add-ons self-service está detrás de
 * `SELF_SERVICE_ADDONS_ENABLED` (hoy `false`), por lo que estos endpoints no son alcanzables
 * hasta el switch manual de lanzamiento (post-gate + sandbox MP verde). El adaptador deja el
 * cableado listo sin tocar los archivos de F3 (create-preference / webhook / provider).
 */

/** Forma extendida del provider que F3 implementa (las dos ops del puerto de add-ons). */
type ProviderWithAddonOps = PaymentsProvider & Partial<AddonPaymentsPort>

export function buildAddonPaymentsPort(): AddonPaymentsPort {
    const provider = getPaymentsProvider() as ProviderWithAddonOps

    return {
        async updateCheckoutAmount(checkoutId: string, amountClp: number, idempotencyKey?: string): Promise<void> {
            if (typeof provider.updateCheckoutAmount !== 'function') {
                throw new Error(
                    'PaymentsProvider.updateCheckoutAmount no implementado (pendiente F3 — integración MercadoPago).'
                )
            }
            // Forward de la idempotency-key (PUTs cupón-driven dedup): los add-on PUTs ahora la mandan.
            return provider.updateCheckoutAmount(checkoutId, amountClp, idempotencyKey)
        },
        async createOneShotPayment(input) {
            if (typeof provider.createOneShotPayment !== 'function') {
                throw new Error(
                    'PaymentsProvider.createOneShotPayment no implementado (pendiente F3 — integración MercadoPago).'
                )
            }
            return provider.createOneShotPayment(input)
        },
    }
}
