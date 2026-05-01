import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { resolveMetadataBase } from '@/lib/site-url'
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
    const site = resolveMetadataBase()
    const absoluteStudentAppUrl = new URL(`/c/${encodeURIComponent(coachSlug)}`, site).href
    return (
        <DashboardShell
            data={data}
            coachId={userId}
            coachName={coachName}
            coachSlug={coachSlug}
            absoluteStudentAppUrl={absoluteStudentAppUrl}
            initialOnboardingGuide={initialOnboardingGuide}
            subscriptionTier={subscriptionTier}
            hasCoachLogo={hasCoachLogo}
        />
    )
}
