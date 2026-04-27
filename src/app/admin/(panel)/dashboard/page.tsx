import { getPlatformOverview } from './_data/admin.queries'
import { KpiStrip } from './_components/KpiStrip'
import { ChartSection } from './_components/ChartSection'
import { RecentActivity } from './_components/RecentActivity'

export const metadata = { title: 'Dashboard' }

export default async function AdminDashboardPage() {
    const data = await getPlatformOverview()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Dashboard CEO</h1>
                <p className="text-xs text-[--admin-text-3]">Visión global de la plataforma EVA.</p>
            </div>

            <KpiStrip data={data} />

            <ChartSection
                mrrSeries={data.mrrSeries}
                tierSeries={data.tierMonthlySeries}
                sessions={data.workoutSessionsSeries}
                coachesByTier={data.coachesByTier}
            />

            <RecentActivity
                signups={data.recentCoachSignups}
                auditEvents={data.recentAuditEvents}
            />
        </div>
    )
}
