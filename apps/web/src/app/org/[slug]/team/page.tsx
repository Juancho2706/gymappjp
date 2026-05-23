import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { EnterpriseComingSoonPage } from '../_components/EnterpriseComingSoonPage'

export const metadata: Metadata = { title: 'Team & Access' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgTeamPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    return (
        <EnterpriseComingSoonPage
            orgSlug={slug}
            title="Team & Access"
            eyebrow="Cuentas enterprise separadas"
            description="Crea usuarios enterprise para socios y administradores. No son coaches ni alumnos; tienen permisos propios."
            icon={ShieldCheck}
            capabilities={[
                'Usuarios enterprise con email, password temporal y MFA.',
                'Roles owner, admin, operations, payments, brand manager y analyst.',
                'Permisos granulares por modulo.',
                'Auditoria para creacion, cambios de permisos y desactivaciones.',
            ]}
            nextSteps={[
                'Confirmar tablas organization_users/roles/permissions.',
                'Definir first-login reset y flujo de MFA obligatorio.',
                'Agregar permission checks server-side antes de mutations.',
            ]}
        />
    )
}

