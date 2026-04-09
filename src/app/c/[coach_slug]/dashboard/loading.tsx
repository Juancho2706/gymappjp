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

export default function LoadingClientDashboard() {
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-5xl px-4 py-4 pb-[calc(80px+env(safe-area-inset-bottom))] sm:px-6 md:pb-6">
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
    )
}
