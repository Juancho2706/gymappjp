import type { Metadata } from 'next'
import { BRAND_OG_IMAGE, BRAND_OG_IMAGE_HEIGHT, BRAND_OG_IMAGE_WIDTH } from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
import { LandingPage4Client } from './LandingPage4Client'

const metadataBase = resolveMetadataBase()
const openGraphImageAbsoluteUrl = new URL(BRAND_OG_IMAGE, metadataBase).href

export const metadata: Metadata = {
    title: 'EVA · FORGE — Plataforma para coaches',
    description:
        'Rutinas, nutrición según plan, check-ins y PWA con tu marca. Vitrina FORGE con demos de interfaz coach y alumno.',
    openGraph: {
        title: 'EVA | landingpage4 — FORGE',
        description: 'Branding FORGE + Three.js + planes en CLP. Demos de vista coach y alumno.',
        url: 'https://www.eva-app.cl/landingpage4',
        siteName: 'EVA',
        type: 'website',
        images: [
            {
                url: openGraphImageAbsoluteUrl,
                width: BRAND_OG_IMAGE_WIDTH,
                height: BRAND_OG_IMAGE_HEIGHT,
                alt: 'EVA',
            },
        ],
    },
}

export default function LandingPage4Page() {
    return <LandingPage4Client />
}
