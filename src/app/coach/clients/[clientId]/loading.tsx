import { Skeleton } from '@/components/ui/skeleton'

export default function ClientProfileLoading() {
    return (
        <div className="mx-auto mb-24 max-w-[1600px] space-y-8 md:mb-0">
            {/* Back link */}
            <Skeleton className="h-4 w-48" />

            {/* Hero header */}
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
                <Skeleton className="h-28 w-28 shrink-0 rounded-2xl md:h-32 md:w-32" />
                <div className="min-w-0 flex-1 space-y-4">
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-4 w-56" />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-8 w-24 rounded-full" />
                        <Skeleton className="h-8 w-28 rounded-full" />
                        <Skeleton className="h-8 w-20 rounded-full" />
                    </div>
                    {/* Stat chips */}
                    <div className="flex flex-wrap gap-3 pt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 w-28 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab nav */}
            <div className="flex gap-0 overflow-hidden border-b border-border/50 pb-0">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-none rounded-t-lg" />
                ))}
            </div>

            {/* Overview tab skeleton — alert banner + rings + heatmap + KPI + sidebar */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                <div className="space-y-5 md:col-span-8">
                    {/* Alert banner */}
                    <Skeleton className="h-14 rounded-xl" />
                    {/* Compliance rings */}
                    <div className="grid grid-cols-3 gap-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-32 rounded-xl" />
                        ))}
                    </div>
                    {/* Activity heatmap */}
                    <Skeleton className="h-36 rounded-xl" />
                    {/* KPI grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-xl" />
                        ))}
                    </div>
                    {/* Program + check-in row */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Skeleton className="h-44 rounded-xl" />
                        <Skeleton className="h-44 rounded-xl" />
                    </div>
                </div>
                {/* Sidebar metrics */}
                <div className="space-y-4 md:col-span-4">
                    <Skeleton className="h-64 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                </div>
            </div>
        </div>
    )
}
