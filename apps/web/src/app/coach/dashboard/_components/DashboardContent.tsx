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
    activeClientCount,
    coachMaxClients,
    coachCreatedAt,
}: {
    userId: string
    coachName: string
    coachSlug: string
    coachInviteCode?: string | null
    initialOnboardingGuide: Json
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
    coachLogoUrl?: string | null
    activeClientCount?: number | null
    /** `coaches.max_clients` — cupo efectivo del coach (override manual / grandfather). */
    coachMaxClients?: number | null
    /** `coaches.created_at` — ancla del grandfather de pricing v2 si falta la columna. */
    coachCreatedAt?: string | null
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
            activeClientCount={activeClientCount}
            coachMaxClients={coachMaxClients}
            coachCreatedAt={coachCreatedAt}
            workspaces={workspaces}
        />
    )
}
