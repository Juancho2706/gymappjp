import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgClients, getOrgMembers, getOrgStats } from './_data/org.queries'
import { EnterpriseDashboardHome } from './_components/dashboard/EnterpriseDashboardHome'

interface Props {
    params: Promise<{ slug: string }>
}

export const metadata: Metadata = { title: 'Dashboard' }

export default async function OrgDashboardPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) redirect('/coach/dashboard')

    const [stats, members, clients] = await Promise.all([
        getOrgStats(org.id),
        getOrgMembers(org.id),
        getOrgClients(org.id),
    ])

    return (
        <EnterpriseDashboardHome
            org={org}
            slug={slug}
            stats={stats}
            members={members}
            clients={clients}
        />
    )
}

