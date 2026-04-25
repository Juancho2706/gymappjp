import { Suspense } from 'react'
import { getPlatformOverview } from './_data/admin.queries'
import { KpiStrip } from './_components/KpiStrip'
import { ChartSection } from './_components/ChartSection'
import { RecentActivity } from './_components/RecentActivity'

export default async function AdminDashboardPage() {
    const data = await getPlatformOverview()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard CEO</h1>
                <p className="text-sm text-neutral-400">Visión global de la plataforma EVA.</p>
            </div>

            <Suspense fallback={<KpiStripSkeleton />}>
                <KpiStrip data={data} />
            </Suspense>

            <Suspense fallback={<ChartsSkeleton />}>
                <ChartSection
                    signups={data.coachSignupsSeries}
                    sessions={data.workoutSessionsSeries}
                    subscriptionEvents={data.subscriptionEventsSeries}
                />
            </Suspense>

            <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-neutral-900" />}>
                <RecentActivity signups={data.recentCoachSignups} />
            </Suspense>
        </div>
    )
}

function KpiStripSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-900" />
            ))}
        </div>
    )
}

function ChartsSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-neutral-900" />
            ))}
        </div>
    )
}
