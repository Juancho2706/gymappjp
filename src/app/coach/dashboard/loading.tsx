import { Skeleton } from "@/components/ui/skeleton"
import { GlassCard } from "@/components/ui/glass-card"

export default function CoachDashboardLoading() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <Skeleton className="h-12 w-64 md:h-14 md:w-80" />
                    <Skeleton className="h-4 w-48 md:w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Stats Grid Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <GlassCard key={i} className="h-32 md:h-40 p-4 md:p-6 space-y-4">
                        <div className="flex justify-between">
                            <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-xl" />
                            <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-16 md:h-8 md:w-20" />
                            <Skeleton className="h-3 w-24 md:w-28" />
                        </div>
                    </GlassCard>
                ))}
            </div>

            {/* Charts Skeleton */}
            <GlassCard className="h-[400px] w-full p-6">
                <div className="flex justify-between mb-8">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-6 w-48" />
                </div>
                <div className="flex items-end justify-between h-[250px] gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="w-full h-full opacity-20" />
                    ))}
                </div>
            </GlassCard>

            {/* Bottom Grid Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <GlassCard className="lg:col-span-2 h-[400px]">
                    <div className="p-6 border-b border-border flex justify-between">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="p-6 space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                                <div className="space-y-2 w-full">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
                <GlassCard className="h-[400px]">
                    <div className="p-6 border-b border-border flex justify-between">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-5 w-8" />
                    </div>
                    <div className="p-6 space-y-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="space-y-3">
                                <div className="flex gap-3">
                                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                                    <div className="space-y-2 w-full">
                                        <Skeleton className="h-4 w-2/3" />
                                        <Skeleton className="h-3 w-1/3" />
                                    </div>
                                </div>
                                <Skeleton className="h-9 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </div>
    )
}
