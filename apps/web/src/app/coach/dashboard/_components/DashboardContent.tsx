import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { getCoachDashboardDataV2 } from '../_data/dashboard.queries'
import { DashboardShell } from './DashboardShell'

export async function DashboardContent({
    userId,
    coachName,
    coachSlug,
    initialOnboardingGuide,
    subscriptionTier,
    hasCoachLogo,
}: {
    userId: string
    coachName: string
    coachSlug: string
    initialOnboardingGuide: Json
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
}) {
    const data = await getCoachDashboardDataV2(userId)
    return (
        <DashboardShell
            data={data}
            coachId={userId}
            coachName={coachName}
            coachSlug={coachSlug}
            initialOnboardingGuide={initialOnboardingGuide}
            subscriptionTier={subscriptionTier}
            hasCoachLogo={hasCoachLogo}
        />
    )
}
