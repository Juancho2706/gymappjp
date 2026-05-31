import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgAuditLogs, getOrgBySlug, getOrgClientPayments, getOrgClients, getOrgMembers, getOrgStats } from './_data/org.queries'
import { EnterpriseDashboardHome } from './_components/dashboard/EnterpriseDashboardHome'

interface Props {
    params: Promise<{ slug: string }>
}

export const metadata: Metadata = { title: 'Dashboard' }

function addMonths(dateValue: string, months: number) {
    const [year, month, day] = dateValue.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    date.setUTCMonth(date.getUTCMonth() + Math.max(1, months))
    return date.toISOString().slice(0, 10)
}

function daysUntil(dateValue: string, todayValue: string) {
    return Math.ceil((new Date(`${dateValue}T00:00:00Z`).getTime() - new Date(`${todayValue}T00:00:00Z`).getTime()) / 86_400_000)
}

export default async function OrgDashboardPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) redirect('/coach/dashboard')

    const [stats, members, clients, recentActivity, payments] = await Promise.all([
        getOrgStats(org.id),
        getOrgMembers(org.id),
        getOrgClients(org.id),
        getOrgAuditLogs(org.id, {}, 8),
        getOrgClientPayments(org.id),
    ])
    const latestPaymentByClient = new Map<string, typeof payments[number]>()
    for (const payment of payments) {
        if (!latestPaymentByClient.has(payment.client_id)) latestPaymentByClient.set(payment.client_id, payment)
    }
    const today = new Date().toISOString().slice(0, 10)
    const activePaymentRows = clients
        .filter((client) => client.is_active !== false)
        .map((client) => {
            const payment = latestPaymentByClient.get(client.id)
            const exempt = payment?.status === 'scholarship' || payment?.status === 'paused'
            const nextDue = payment && !exempt ? addMonths(payment.payment_date, payment.period_months ?? 1) : null
            return {
                payment,
                dueInDays: nextDue ? daysUntil(nextDue, today) : null,
                exempt,
            }
        })
    const paymentAlerts = {
        missing: activePaymentRows.filter((row) => !row.payment).length,
        overdue: activePaymentRows.filter((row) => !row.exempt && (row.payment?.status === 'overdue' || (row.dueInDays !== null && row.dueInDays < 0))).length,
        dueSoon: activePaymentRows.filter((row) => !row.exempt && row.payment?.status !== 'overdue' && row.dueInDays !== null && row.dueInDays >= 0 && row.dueInDays <= 7).length,
    }

    return (
        <EnterpriseDashboardHome
            org={org}
            slug={slug}
            stats={stats}
            members={members}
            clients={clients}
            recentActivity={recentActivity}
            paymentAlerts={paymentAlerts}
        />
    )
}
