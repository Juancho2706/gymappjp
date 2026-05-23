import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Audit Log' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgAuditPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Audit Log"
            eyebrow="Confianza y cumplimiento"
            description="Historial de cambios sensibles: permisos, marca, asignaciones, exports, pagos operacionales y settings."
            icon={FileText}
            accent="rose"
            capabilities={[
                'Evento auditable por cada mutation enterprise.',
                'Actor, timestamp, target, metadata e IP/user agent cuando exista.',
                'Filtro por usuario, modulo y tipo de accion.',
                'Base para soporte, compliance y customer success.',
            ]}
            nextSteps={[
                'Disenar organization_audit_logs.',
                'Agregar helper central para escribir eventos.',
                'Conectar mutations enterprise futuras al audit trail.',
            ]}
        />
    )
}

