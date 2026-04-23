import {
    CalendarSkeleton,
    CheckInSkeleton,
    DashboardHeaderSkeleton,
    DashboardSidebarSkeleton,
    HeroOnlySkeleton,
    HistorySkeleton,
    ProgramSkeleton,
    WeightChartSkeleton,
} from './_components/dashboard-skeletons'
import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'

export default function LoadingClientDashboard() {
    return (
        <ClientLoadingShell>
            <div className="min-h-dvh bg-background">
                <div className="mx-auto max-w-5xl px-4 pt-[var(--mobile-content-top-offset)] pb-[calc(1rem+var(--mobile-content-bottom-offset))] sm:px-6 md:pb-6 lg:pt-4">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="min-w-0 space-y-4">
                            <DashboardHeaderSkeleton />
                            <CalendarSkeleton />
                            <CheckInSkeleton />
                            <HeroOnlySkeleton />
                            <div className="space-y-4 md:hidden">
                                <DashboardSidebarSkeleton />
                            </div>
                            <ProgramSkeleton />
                            <HistorySkeleton />
                            <WeightChartSkeleton />
                        </div>
                        <aside className="hidden flex-col gap-4 self-start md:sticky md:top-6 md:flex">
                            <DashboardSidebarSkeleton />
                        </aside>
                    </div>
                </div>
            </div>
        </ClientLoadingShell>
    )
}
