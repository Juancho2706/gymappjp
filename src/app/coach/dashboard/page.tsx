import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DashboardContent } from './_components/DashboardContent'
import { getCoach } from '@/lib/coach/get-coach'
import { BrandCoachLoadingShell } from '../_components/BrandCoachLoadingShell'
import type { SubscriptionTier } from '@/lib/constants'
import type { Json } from '@/lib/database.types'

export const metadata: Metadata = { title: 'Dashboard' }

/** Misma referencia entre renders RSC para no disparar efectos del checklist con `{}` nuevo cada vez. */
const DEFAULT_COACH_ONBOARDING_GUIDE: Json = {}

function normalizeCoachSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
    const v = String(raw ?? 'starter').toLowerCase()
    if (v === 'starter' || v === 'pro' || v === 'elite' || v === 'scale') return v
    return 'starter'
}

export default async function CoachDashboardPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const subscriptionTier = normalizeCoachSubscriptionTier(coach.subscription_tier)

    return (
        <Suspense fallback={<BrandCoachLoadingShell />}>
            <DashboardContent
                userId={coach.id}
                coachName={coach.full_name ?? coach.brand_name ?? 'Coach'}
                coachSlug={coach.slug}
                initialOnboardingGuide={coach.onboarding_guide ?? DEFAULT_COACH_ONBOARDING_GUIDE}
                subscriptionTier={subscriptionTier}
                hasCoachLogo={Boolean(coach.logo_url?.trim())}
            />
        </Suspense>
    )
}
