import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolveMetadataBase } from '@/lib/site-url'
import '../components/landing-v2/landing-v2.css'
import { LandingBrandProvider } from '@/components/landing-v2/_brand-provider'
import { PageLoader } from '@/components/landing-v2/PageLoader'
import { HeroBackdrop } from '@/components/landing-v2/HeroBackdrop'
import { LandingNav } from '@/components/landing-v2/LandingNav'
// Componentes de sección (construidos por otros agentes en paralelo). Todos
// exponen default export → import default uniforme.
import Hero from '@/components/landing-v2/Hero'
import MarcaShowcase from '@/components/landing-v2/MarcaShowcase'
import ModulosSection from '@/components/landing-v2/ModulosSection'
import CoachesProof from '@/components/landing-v2/CoachesProof'
import ModulosPro from '@/components/landing-v2/ModulosPro'
import PreciosSection from '@/components/landing-v2/PreciosSection'
import TeamsSection from '@/components/landing-v2/TeamsSection'
import FaqSection from '@/components/landing-v2/FaqSection'
import CtaFinal from '@/components/landing-v2/CtaFinal'
import { LandingFooter } from '@/components/landing-v2/LandingFooter'

// Geist Mono NO está en el layout (la app usa JetBrains Mono). La landing lo
// carga scopeado: la CSS var `--font-geist-mono` se aplica al root de la landing
// vía `fontClassName` (preload:false → sólo baja la woff2 al usarse). Spec §4 opción A.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

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
        <LandingBrandProvider fontClassName={geistMono.variable}>
            {/* JSON-LD inline (server-rendered, sin next/script) → visible al crawler sin ejecutar JS. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(teamsJsonLd) }}
            />
            <PageLoader />
            <HeroBackdrop />
            <LandingNav />
            <main>
                <Hero />
                <MarcaShowcase />
                <ModulosSection exerciseCount={exerciseCount} />
                <CoachesProof />
                <ModulosPro />
                <PreciosSection exerciseCount={exerciseCount} />
                <TeamsSection />
                <FaqSection exerciseCount={exerciseCount} />
                <CtaFinal />
                <LandingFooter />
            </main>
        </LandingBrandProvider>
    )
}
