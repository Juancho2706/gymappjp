import type { Metadata } from 'next'
import Script from 'next/script'
import { LandingPillNav } from '@/components/landing/LandingPillNav'
import { LandingStickyBrandingCard } from '@/components/landing/LandingStickyBrandingCard'
import { LandingHeroSection } from '@/components/landing/LandingHeroSection'
import { LandingCoachCalloutSections } from '@/components/landing/LandingCoachCalloutSections'
import { LandingExerciseCatalogShowcase } from '@/components/landing/LandingExerciseCatalogShowcase'
import { LandingPricingPreview } from '@/components/landing/LandingPricingPreview'
import { LandingStudentTabs } from '@/components/landing/LandingStudentTabs'
import { LandingFinalCTA } from '@/components/landing/LandingFinalCTA'
import { LandingContactFooter } from '@/components/landing/LandingContactFooter'
import { LandingTeamsSection } from '@/components/landing/LandingTeamsSection'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export const metadata: Metadata = {
    title: 'EVA | Software para Coaches, Personal Trainers y Gyms en Chile',
    description: 'EVA: plataforma para coaches, personal trainers y centros de entrenamiento. Rutinas, nutrición, evaluaciones y app con tu marca. Desde gratis — EVA Teams para equipos.',
    keywords: ['software gym chile', 'software academia deportiva', 'app personal trainer', 'gestión coaches', 'software centro entrenamiento'],
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

    // JSON-LD de EVA Teams: SIN price/priceCurrency (regla dura anti-precio,
    // memoria project-movida-commercial — aplica tambien al markup). Solo
    // capacidades + punto de contacto de ventas.
    const teamsJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'OfferCatalog',
        name: 'EVA Teams',
        description: 'EVA Teams para centros de entrenamiento y equipos multidisciplinarios: pool de alumnos compartido, marca del centro y módulos profesionales.',
        itemListElement: [
            { '@type': 'OfferCatalog', name: 'Pool de alumnos compartido' },
            { '@type': 'OfferCatalog', name: 'La marca de tu centro' },
            { '@type': 'OfferCatalog', name: 'Módulos profesionales' },
            { '@type': 'OfferCatalog', name: 'Equipo self-service' },
        ],
        contactPoint: {
            '@type': 'ContactPoint',
            email: SALES_EMAIL,
            contactType: 'sales',
        },
    }

    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-clip">
            <Script
                id="home-json-ld"
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Script
                id="teams-json-ld"
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(teamsJsonLd) }}
            />
            <LandingPillNav />
            <LandingStickyBrandingCard />
            <main>
                <LandingHeroSection exerciseCount={exerciseCount} />
                <LandingCoachCalloutSections />
                <LandingExerciseCatalogShowcase exerciseCount={exerciseCount} />
                <LandingPricingPreview />
                <LandingStudentTabs />
                <LandingTeamsSection />
                <LandingFinalCTA />
                <LandingContactFooter />
            </main>
        </div>
    )
}
