import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ReactivateClient } from './ReactivateClient'
import type { SubscriptionTier } from '@/lib/constants'
import { getReactivatePageData } from './_data/reactivate.queries'

export default async function ReactivatePage() {
    const { user, coach, activeClientCount, recentlyCancelledAddons } = await getReactivatePageData()
    if (!user) redirect('/login')

    const currentTier = (coach?.subscription_tier ?? 'starter') as SubscriptionTier
    const subscriptionStatus = coach?.subscription_status ?? null
    // Mismo gate de dinero fail-closed que el endpoint redeem-coupon-signup ('=== true' exacto).
    const couponsEnabled = process.env.COUPON_REDEMPTION_ENABLED === 'true'

    return (
        <Suspense>
            <ReactivateClient
                currentTier={currentTier}
                activeClientCount={activeClientCount}
                subscriptionStatus={subscriptionStatus}
                currentPeriodEnd={coach?.current_period_end ?? null}
                paidAccessEndedAt={coach?.paid_access_ended_at ?? null}
                recentlyCancelledAddons={recentlyCancelledAddons}
                couponsEnabled={couponsEnabled}
            />
        </Suspense>
    )
}
