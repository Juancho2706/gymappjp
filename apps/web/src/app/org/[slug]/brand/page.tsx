import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Palette } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Brand Center' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgBrandPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Brand Center"
            eyebrow="White-label enterprise"
            description="Configura logo, colores, loader y previews para que coaches enterprise y alumnos vean la marca de la organizacion."
            icon={Palette}
            capabilities={[
                'Branding enterprise como fuente de verdad para coaches y alumnos.',
                'Preview de dashboard enterprise, coach app, alumno PWA y loaders.',
                'Governance de contraste, paletas seguras y publicacion auditada.',
                'Bloqueo de marca individual para coaches creados por la empresa.',
            ]}
            nextSteps={[
                'Confirmar modelo de datos organization_branding.',
                'Definir assets minimos: logo, app icon, color primario y loader.',
                'Implementar draft/publish con permisos brand.publish.',
            ]}
        />
    )
}

