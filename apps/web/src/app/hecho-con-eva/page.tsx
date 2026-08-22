import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import { resolveMetadataBase } from '@/lib/site-url'
import { getPublicExerciseCount } from '../_data/landing.queries'
import '../../components/landing-v2/landing-v2.css'
import { LandingBrandProvider } from '@/components/landing-v2/_brand-provider'
import { HeroBackdrop } from '@/components/landing-v2/HeroBackdrop'
import HechoConEvaContent from './_components/HechoConEvaContent'

// Mismo tratamiento que `/`: Geist Mono scopeado a la landing vía CSS var (la app usa JetBrains).
const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
    display: 'swap',
    preload: false,
})

/**
 * Destino del sello «Hecho con EVA» (`getEvaBadgeUrl`, `packages/tiers`). Indexable a propósito:
 * es contenido real y una puerta de entrada orgánica. Lo que NO lleva —y no puede llevar— es un
 * precio: el sello se toca desde la app del alumno, iOS incluido (embudo-free-pro W5.1).
 */
export async function generateMetadata(): Promise<Metadata> {
    return {
        title: { absolute: 'Hecho con EVA — la plataforma detrás de la app de tu coach' },
        description:
            'Tu coach usa EVA para armar tus rutinas, tu nutrición y tu seguimiento, y su app lleva su propia marca. Descubre qué es EVA y crea tu cuenta de coach gratis.',
        alternates: { canonical: '/hecho-con-eva' },
        robots: { index: true, follow: true },
        openGraph: {
            title: 'Hecho con EVA',
            description: 'La plataforma detrás de la app de tu coach.',
            url: new URL('/hecho-con-eva', resolveMetadataBase()).href,
            type: 'website',
        },
    }
}

export default async function HechoConEvaPage() {
    const exerciseCount = await getPublicExerciseCount()

    return (
        <LandingBrandProvider fontClassName={geistMono.variable}>
            <HeroBackdrop />
            <main>
                <HechoConEvaContent exerciseCount={exerciseCount} />
            </main>
        </LandingBrandProvider>
    )
}
