import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    getOrgAnnouncements,
    getOrgAuditLogs,
    getOrgBySlug,
    getOrgCheckInOverview,
    getOrgClients,
    getOrgMembers,
} from '../_data/org.queries'
import { OnboardingWizard } from './_components/OnboardingWizard'
import { OrgProgressTracker } from './_components/OrgProgressTracker'

export const metadata: Metadata = { title: 'Configuración inicial' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OnboardingPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [members, clients, announcements, auditLogs, checkIns] = await Promise.all([
        getOrgMembers(org.id),
        getOrgClients(org.id),
        getOrgAnnouncements(org.id),
        getOrgAuditLogs(org.id, {}, 100),
        getOrgCheckInOverview(org.id),
    ])

    const activeCoaches = members.filter(m => m.status === 'active' && m.role === 'coach').length
    const pendingInvites = members.filter(m => m.status === 'invited').length
    const unassignedClients = clients.filter(client => client.is_active !== false && !client.coach_id).length
    const assignedClients = clients.filter(client => client.is_active !== false && client.coach_id).length

    // Time-to-value milestones from real data
    const hasLiveAnnouncement = announcements.some(a => a.is_active)
    const hasExportedReport = auditLogs.some(l => l.action.includes('exported'))
    const hasCheckIns = checkIns.total7d > 0

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <OrgProgressTracker
                    orgSlug={slug}
                    milestones={{
                        hasBrand: Boolean(org.logo_url && org.primary_color),
                        hasActiveCoach: activeCoaches >= 1,
                        hasAssignedClient: assignedClients >= 1,
                        hasAnnouncement: hasLiveAnnouncement,
                        hasExportedReport,
                        hasCheckIns,
                        healthScore: org.last_health_score ?? 0,
                    }}
                />
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
            </div>
        </div>
    )
}
