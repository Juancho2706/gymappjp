import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { BarChart3 } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Reportes' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgReportsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Reportes operacionales"
            eyebrow="Decision intelligence"
            description="Reportes semanales para entender performance de coaches, adherencia de alumnos, capacidad y riesgos."
            icon={BarChart3}
            accent="sky"
            capabilities={[
                'Reporte semanal de salud operacional.',
                'Performance por coach y carga asignada.',
                'Alumnos en riesgo y adherencia por periodo.',
                'CSV primero, PDF y envio programado despues.',
            ]}
            nextSteps={[
                'Definir formulas exactas de metricas.',
                'Separar facts de insights para evitar claims falsos.',
                'Priorizar exports utiles para reuniones del owner.',
            ]}
        />
    )
}

