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

    return (
        <Suspense>
            <ReactivateClient
                currentTier={currentTier}
                activeClientCount={activeClientCount}
                subscriptionStatus={subscriptionStatus}
                recentlyCancelledAddons={recentlyCancelledAddons}
            />
        </Suspense>
    )
}
