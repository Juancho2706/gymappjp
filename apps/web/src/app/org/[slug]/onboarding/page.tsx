import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgMembers, getOrgClients } from '../_data/org.queries'
import { OnboardingWizard } from './_components/OnboardingWizard'

export const metadata: Metadata = { title: 'Configuración inicial' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OnboardingPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [members, clients] = await Promise.all([
        getOrgMembers(org.id),
        getOrgClients(org.id),
    ])

    const activeCoaches = members.filter(m => m.status === 'active' && m.role === 'coach').length
    const pendingInvites = members.filter(m => m.status === 'invited').length
    const unassignedClients = clients.filter(client => client.is_active !== false && !client.coach_id).length
    const assignedClients = clients.filter(client => client.is_active !== false && client.coach_id).length

    return (
        <OnboardingWizard
            orgSlug={slug}
            orgName={org.name}
            currentStep={org.onboarding_step ?? 0}
            primaryColor={org.primary_color ?? '#10B981'}
            seatsIncluded={org.seats_included}
            hasLogo={Boolean(org.logo_url)}
            stats={{
                activeCoaches,
                pendingInvites,
                totalClients: clients.length,
                assignedClients,
                unassignedClients,
            }}
        />
    )
}
