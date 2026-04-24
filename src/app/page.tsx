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
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export const metadata: Metadata = {
    title: 'EVA | Plataforma para Personal Trainers y Coaches de Fitness',
    description: 'EVA es la plataforma SaaS para Personal Trainers y Coaches. Crea rutinas profesionales, planes de nutrición, gestiona alumnos y ten tu propia app móvil white-label. Empieza gratis hoy.',
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
                <LandingFinalCTA />
                <LandingContactFooter />
            </main>
        </div>
    )
}
