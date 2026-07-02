import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { getCoachDashboardDataV2 } from '../_data/dashboard.queries'
import { listUserWorkspacesForRender } from '@/services/auth/workspace-render-cache'
import { DashboardShell } from './DashboardShell'

export async function DashboardContent({
    userId,
    coachName,
    coachSlug,
    coachInviteCode,
    initialOnboardingGuide,
    subscriptionTier,
    hasCoachLogo,
    coachLogoUrl,
}: {
    userId: string
    coachName: string
    coachSlug: string
    coachInviteCode?: string | null
    initialOnboardingGuide: Json
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
    coachLogoUrl?: string | null
}) {
    // workspaces: React.cache-memoizado por userId (ya lo resuelve el layout en el mismo
    // request → dedup, sin costo extra de DB). Habilita el switcher de espacio del header móvil.
    const [data, workspaces] = await Promise.all([
        getCoachDashboardDataV2(userId),
        listUserWorkspacesForRender(userId),
    ])
    return (
        <DashboardShell
            data={data}
            coachId={userId}
            coachName={coachName}
            coachSlug={coachSlug}
            coachInviteCode={coachInviteCode}
            initialOnboardingGuide={initialOnboardingGuide}
            subscriptionTier={subscriptionTier}
            hasCoachLogo={hasCoachLogo}
            coachLogoUrl={coachLogoUrl}
            workspaces={workspaces}
        />
    )
}
