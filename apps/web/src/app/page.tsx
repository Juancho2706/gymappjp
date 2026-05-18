import type { Metadata } from 'next'
import { LandingPillNav } from '@/components/landing/LandingPillNav'
import { LandingStickyBrandingCard } from '@/components/landing/LandingStickyBrandingCard'
import { LandingHeroSection } from '@/components/landing/LandingHeroSection'
import { LandingCoachCalloutSections } from '@/components/landing/LandingCoachCalloutSections'
import { LandingExerciseCatalogShowcase } from '@/components/landing/LandingExerciseCatalogShowcase'
import { LandingPricingPreview } from '@/components/landing/LandingPricingPreview'
import { LandingStudentTabs } from '@/components/landing/LandingStudentTabs'
import { LandingFinalCTA } from '@/components/landing/LandingFinalCTA'
import { LandingContactFooter } from '@/components/landing/LandingContactFooter'
import { LandingEnterpriseSection } from '@/components/landing/LandingEnterpriseSection'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export const metadata: Metadata = {
    title: 'EVA | Software para Coaches, Personal Trainers y Gyms en Chile',
    description: 'EVA: plataforma SaaS para coaches individuales y gyms. Panel centralizado por organización, rutinas, nutrición y app white-label. Desde gratis hasta planes enterprise.',
    keywords: ['software gym chile', 'software academia deportiva', 'app personal trainer', 'gestión coaches'],
    alternates: {
        canonical: '/',
    },
    robots: {
        index: true,
        follow: true,
    },
}

async function getExerciseCount(): Promise<number> {
    try {
        const supabase = createServiceRoleClient()
        const { count } = await supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .is('coach_id', null)
        return count ?? 129
    } catch {
        return 129
    }
}

export default async function LandingPage() {
    const exerciseCount = await getExerciseCount()

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'EVA',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        description: 'Plataforma SaaS para Personal Trainers y Coaches. Rutinas, nutrición y app móvil white-label.',
        offers: {
            '@type': 'Offer',
            priceCurrency: 'CLP',
            price: '0',
            description: 'Prueba gratuita disponible',
        },
    }

    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <LandingPillNav />
            <LandingStickyBrandingCard />
            <main>
                <LandingHeroSection exerciseCount={exerciseCount} />
                <LandingCoachCalloutSections />
                <LandingExerciseCatalogShowcase exerciseCount={exerciseCount} />
                <LandingPricingPreview />
                <LandingStudentTabs />
                <LandingEnterpriseSection />
                <LandingFinalCTA />
                <LandingContactFooter />
            </main>
        </div>
    )
}
