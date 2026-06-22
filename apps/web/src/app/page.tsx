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
import { LandingTeamsSection } from '@/components/landing/LandingTeamsSection'
import { LandingModulesSection } from '@/components/landing/LandingModulesSection'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolveMetadataBase } from '@/lib/site-url'

export const metadata: Metadata = {
    title: { absolute: 'Software para Personal Trainers y Gyms en Chile | EVA' },
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

    const metadataBase = resolveMetadataBase()
    const homeUrl = new URL('/', metadataBase).href
    const orgId = `${homeUrl}#org`

    // Organization + WebSite. SIN sameAs (no hay redes verificadas) y SIN
    // SearchAction (no existe ruta /search).
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: 'EVA',
                legalName: 'EVA Technology SpA',
                url: homeUrl,
                logo: new URL('/icon.png', metadataBase).href,
                email: 'contacto@eva-app.cl',
            },
            {
                '@type': 'WebSite',
                '@id': `${homeUrl}#website`,
                url: homeUrl,
                name: 'EVA',
                publisher: { '@id': orgId },
            },
            {
                '@type': 'SoftwareApplication',
                name: 'EVA',
                url: homeUrl,
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Web, iOS, Android',
                description: 'Plataforma SaaS para Personal Trainers y Coaches. Rutinas, nutrición y app móvil white-label.',
                offers: {
                    '@type': 'Offer',
                    priceCurrency: 'CLP',
                    price: '0',
                    availability: 'https://schema.org/InStock',
                    description: 'Prueba gratuita disponible',
                },
            },
        ],
    }

    // JSON-LD de EVA Teams: SIN price/priceCurrency (regla dura anti-precio,
    // memoria project-movida-commercial — aplica tambien al markup). Solo
    // capacidades + punto de contacto de ventas.
    const teamsJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'EVA Teams',
        description: 'EVA Teams para centros de entrenamiento y equipos multidisciplinarios: pool de alumnos compartido, marca del centro y módulos profesionales.',
        provider: { '@id': orgId },
        areaServed: 'CL',
        hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'EVA Teams',
            itemListElement: [
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Pool de alumnos compartido' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'La marca de tu centro' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Módulos profesionales' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Equipo self-service' } },
            ],
        },
        contactPoint: {
            '@type': 'ContactPoint',
            email: SALES_EMAIL,
            contactType: 'sales',
        },
    }

    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-clip">
            {/* JSON-LD inline (server-rendered, sin next/script) → visible al crawler sin ejecutar JS. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
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
                <LandingModulesSection />
                <LandingStudentTabs />
                <LandingTeamsSection />
                <LandingFinalCTA />
                <LandingContactFooter />
            </main>
        </div>
    )
}
