import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ReactivateClient } from './ReactivateClient'
import { CHANGE_CARD_ENABLED, type SubscriptionTier } from '@/lib/constants'
import { getReactivatePageData } from './_data/reactivate.queries'

/** Estados de DUNNING donde el swap in-place sigue permitido — espejo de `PUT_ALLOWED_STATUSES`
 *  (services/billing/change-card.service.ts:63) restringido a los que llegan bloqueados a esta
 *  pantalla. `expired`/`canceled` son terminales para MP: ahí el único camino es contratar de nuevo. */
const DUNNING_STATUSES = new Set(['paused', 'past_due'])

export default async function ReactivatePage() {
    const { user, coach, activeClientCount, activeClients, recentlyCancelledAddons, activeDiscount } = await getReactivatePageData()
    if (!user) redirect('/login')

    const currentTier = (coach?.subscription_tier ?? 'free') as SubscriptionTier
    const subscriptionStatus = coach?.subscription_status ?? null
    // Mismo gate de dinero fail-closed que el endpoint redeem-coupon-signup ('=== true' exacto).
    const couponsEnabled = process.env.COUPON_REDEMPTION_ENABLED === 'true'

    // Salida del callejón del dunning (pricing 05-09): el gate deposita acá al coach en
    // paused/past_due sin período vigente, pero MP todavía puede cobrarle (`subscription_mp_id`
    // vivo ⇒ para `paid-expiry` la sub está VIVA y sigue reintentando). El flag se lee ACÁ,
    // server-side, porque `CHANGE_CARD_ENABLED` no es NEXT_PUBLIC (en el cliente siempre da false).
    const canChangeCard =
        CHANGE_CARD_ENABLED &&
        !!coach?.subscription_mp_id &&
        DUNNING_STATUSES.has(subscriptionStatus ?? '')

    // `coachMaxClients`: Pricing v3 pone el grandfather en la COLUMNA `coaches.max_clients`
    // (backfill por uso del 21-08), no en la fecha. `coachCreatedAt` queda solo para proyectar
    // los tiers que el coach todavía NO tiene (lo que el write-path grabará si los contrata).
    return (
        <Suspense>
            <ReactivateClient
                currentTier={currentTier}
                activeClientCount={activeClientCount}
                activeClients={activeClients}
                subscriptionStatus={subscriptionStatus}
                currentPeriodEnd={coach?.current_period_end ?? null}
                paidAccessEndedAt={coach?.paid_access_ended_at ?? null}
                coachCreatedAt={coach?.created_at ?? null}
                coachMaxClients={coach?.max_clients ?? null}
                recentlyCancelledAddons={recentlyCancelledAddons}
                couponsEnabled={couponsEnabled}
                activeDiscount={activeDiscount}
                canChangeCard={canChangeCard}
            />
        </Suspense>
    )
}
