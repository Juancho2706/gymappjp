import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ClipboardCheck } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Asignaciones' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgAssignmentsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Asignaciones alumno-coach"
            eyebrow="Operacion"
            description="Gestiona alumnos sin coach, capacidad por coach y reasignaciones con historial auditable."
            icon={ClipboardCheck}
            accent="emerald"
            capabilities={[
                'Queue de alumnos sin coach asignado.',
                'Capacidad por coach con advertencias de sobrecarga.',
                'Asignacion masiva y reasignacion segura.',
                'Historial de cambios para soporte y accountability.',
            ]}
            nextSteps={[
                'Confirmar source of truth actual para clients.coach_id.',
                'Disenar client_assignment_events antes de cambiar ownership.',
                'Crear flujo mobile stepper y desktop board.',
            ]}
        />
    )
}

