import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DashboardContent } from './_components/DashboardContent'
import { getCoach, getActiveStandaloneClientCount } from '@/lib/coach/get-coach'
import { BrandCoachLoadingShell } from '../_components/BrandCoachLoadingShell'
import type { SubscriptionTier } from '@/lib/constants'
import { isBrandingAllowed } from '@eva/tiers'
import { getPersonaScreenContext } from '../onboarding/persona/_data/persona.queries'
import { GUIDE_ROUTE, shouldRedirectToGuide } from '../guia/_lib/guide-first-entry'
import { parseOnboardingGuide } from './_lib/onboarding-guide-state'

export const metadata: Metadata = { title: 'Dashboard' }

function normalizeCoachSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
    const v = String(raw ?? 'free').toLowerCase()
    // LEGACY (plan 04): es PARSE del valor crudo de DB, no venta. Reconoce los 6 valores del CHECK
    // (incluye growth/scale grandfathered + placeholders team/org_managed). NO bajar a sale tiers.
    if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
    return 'free'
}

export default async function CoachDashboardPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    // PRIMERA ENTRADA = LA GUÍA, para todos los planes (decisión del owner 22-08). El coach que
    // ya eligió especialidad y todavía no vio «Tus primeros pasos» aterriza ahí, no en el panel
    // vacío. Pasa UNA sola vez: la pantalla de la guía estampa `onboarding_guide.guide_seen_at`.
    // El resolver es puro y está testeado (`guia/_lib/guide-first-entry`); acá solo se le dan los
    // tres datos. `getPersonaScreenContext` es `React.cache` y el layout ya la resolvió en este
    // mismo request: no agrega una query.
    const personaContext = await getPersonaScreenContext()
    if (
        shouldRedirectToGuide({
            persona: personaContext.persona,
            guide: parseOnboardingGuide(coach.onboarding_guide),
            managed: personaContext.managed,
        })
    ) {
        redirect(GUIDE_ROUTE)
    }

    const subscriptionTier = normalizeCoachSubscriptionTier(coach.subscription_tier)
    const coachBrandingVisible = isBrandingAllowed(subscriptionTier) && coach.use_brand_colors_coach !== false

    // Conteo activo real (mismo servicio que el cap gate) solo para el banner del plan gratuito;
    // React.cache lo deduplica con el layout /coach. Los otros tiers no muestran ese banner.
    const activeClientCount =
        subscriptionTier === 'free' ? await getActiveStandaloneClientCount(coach.id) : null

    return (
        <Suspense fallback={<BrandCoachLoadingShell />}>
            <DashboardContent
                userId={coach.id}
                coachName={coach.full_name ?? coach.brand_name ?? 'Coach'}
                coachSlug={coach.slug}
                coachInviteCode={coach.invite_code}
                persona={personaContext.persona}
                subscriptionTier={subscriptionTier}
                hasCoachLogo={coachBrandingVisible && Boolean(coach.logo_url?.trim())}
                coachLogoUrl={coachBrandingVisible ? coach.logo_url : null}
                activeClientCount={activeClientCount}
                coachMaxClients={coach.max_clients}
                coachCreatedAt={coach.created_at ?? null}
            />
        </Suspense>
    )
}
