import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { BadgeCheck } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Pagos alumnos' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgPaymentsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Pagos alumnos"
            eyebrow="Control operacional"
            description="Registra estados de pago externos por alumno. EVA no procesa cobros in-app en este MVP."
            icon={BadgeCheck}
            capabilities={[
                'Estados pagado, pendiente, vencido, becado o pausado.',
                'Metodo externo: transferencia, efectivo, POS u otro.',
                'Alertas de vencimientos y riesgo comercial.',
                'Export CSV para control interno.',
            ]}
            nextSteps={[
                'Confirmar campos minimos de student_payment_status.',
                'Revisar lenguaje legal: registro operacional, no facturacion tributaria.',
                'Definir si se necesita import CSV desde sistema externo.',
            ]}
        />
    )
}

