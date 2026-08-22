import type { Json } from '@/lib/database.types'
import type { SubscriptionTier } from '@/lib/constants'
import { getCoachDashboardDataV2, getCoachOnboardingV2Data } from '../_data/dashboard.queries'
import { listUserWorkspacesForRender } from '@/services/auth/workspace-render-cache'
import { DashboardShell } from './DashboardShell'
import { isOnboardingGuideHidden } from '../_lib/onboarding-guide-state'

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
    // Onboarding v2: la guía y sus tarjetas mueren del todo cuando el coach las apagó
    // (`onboarding_guide.hidden`). Sin este corte, un coach con 40 alumnos y la guía cerrada
    // pagaría las consultas del día 1 en CADA carga del dashboard.
    const wantsOnboardingV2 = !isOnboardingGuideHidden(initialOnboardingGuide)

    // workspaces: React.cache-memoizado por userId (ya lo resuelve el layout en el mismo
    // request → dedup, sin costo extra de DB). Habilita el switcher de espacio del header móvil.
    const [data, workspaces, onboarding] = await Promise.all([
        getCoachDashboardDataV2(userId),
        listUserWorkspacesForRender(userId),
        wantsOnboardingV2 ? getCoachOnboardingV2Data(userId) : Promise.resolve(null),
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
            onboarding={onboarding}
        />
    )
}
