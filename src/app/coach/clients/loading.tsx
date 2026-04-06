import { Skeleton } from "@/components/ui/skeleton"
import { GlassCard } from "@/components/ui/glass-card"

export default function CoachClientsLoading() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
                    <Skeleton className="h-4 w-32 md:w-80" />
                </div>
                <div className="flex gap-3">
                    <Skeleton className="h-10 w-10 md:w-32 rounded-lg" />
                    <Skeleton className="h-10 w-32 md:w-44 rounded-lg" />
                </div>
            </div>

            {/* Search/Filter Bar Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Skeleton className="h-11 w-full rounded-xl col-span-1 md:col-span-2" />
                <Skeleton className="h-11 w-full rounded-xl" />
            </div>

            {/* Clients Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <GlassCard key={i} className="h-[280px] p-0 flex flex-col overflow-hidden">
                        <div className="p-6 space-y-4 flex-1">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-14 w-14 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-4">
                                <div className="flex justify-between">
                                    <Skeleton className="h-3 w-16" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                                <Skeleton className="h-2 w-full rounded-full" />
                                <div className="flex justify-between pt-2">
                                    <Skeleton className="h-8 w-20 rounded-lg" />
                                    <Skeleton className="h-8 w-20 rounded-lg" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border bg-muted/20">
                            <Skeleton className="h-9 w-full rounded-lg" />
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    )
}
