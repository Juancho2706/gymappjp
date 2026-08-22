import type { SubscriptionTier } from '@/lib/constants'
import type { Persona } from '@eva/schemas'
import { getCoachDashboardDataV2 } from '../_data/dashboard.queries'
import { listUserWorkspacesForRender } from '@/services/auth/workspace-render-cache'
import { DashboardShell } from './DashboardShell'

export async function DashboardContent({
    userId,
    coachName,
    coachSlug,
    coachInviteCode,
    persona,
    subscriptionTier,
    hasCoachLogo,
    coachLogoUrl,
    coachLogoDarkUrl,
    activeClientCount,
    coachMaxClients,
    coachCreatedAt,
}: {
    userId: string
    coachName: string
    coachSlug: string
    coachInviteCode?: string | null
    /**
     * `coaches.persona`. Reservado: lo consumía el modal de bienvenida Free (`?welcome=free`),
     * borrado el 22-08 — la guía (`/coach/guia`) ES la bienvenida. Sigue viajando al shell porque
     * el RSC ya lo resuelve y el contrato no cambia.
     */
    persona: Persona | null
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
    /** Logo de marca del coach — usado como tile del avatar del header móvil (fallback iniciales). */
    coachLogoUrl?: string | null
    /** Variante DARK del logo (`coaches.logo_url_dark`); ausente ⇒ ThemedLogo cae al claro. */
    coachLogoDarkUrl?: string | null
    activeClientCount?: number | null
    /** `coaches.max_clients` — cupo efectivo del coach (override manual / grandfather). */
    coachMaxClients?: number | null
    /** `coaches.created_at` — ancla del grandfather de pricing v2 si falta la columna. */
    coachCreatedAt?: string | null
}) {
    // Onboarding v2 — la guía del día 1 (checklist, «Tu marca en 60 s», alumno de ejemplo, tira
    // del pie) YA NO VIVE ACÁ: se mudó a `/coach/guia` (decisión del owner 22-08, el dashboard del
    // día 1 se ve LLENO). Con ella se fue `getCoachOnboardingV2Data`, que corría en CADA carga del
    // dashboard —marca, «vive tu app», artefacto por persona, alumno real, actividad real— y hoy
    // solo se paga al abrir la guía. El rastro en el panel es la píldora flotante del layout.

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
            persona={persona}
            subscriptionTier={subscriptionTier}
            hasCoachLogo={hasCoachLogo}
            coachLogoUrl={coachLogoUrl}
            coachLogoDarkUrl={coachLogoDarkUrl}
            activeClientCount={activeClientCount}
            coachMaxClients={coachMaxClients}
            coachCreatedAt={coachCreatedAt}
            workspaces={workspaces}
        />
    )
}
