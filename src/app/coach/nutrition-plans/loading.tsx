import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingNutritionPlans() {
    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="h-4 w-80" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-32 rounded-xl" />
                    <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
            </div>

            {/* Tabs Skeleton */}
            <div className="flex gap-2 border-b border-border pb-px">
                <Skeleton className="h-10 w-36 rounded-t-lg" />
                <Skeleton className="h-10 w-44 rounded-t-lg" />
                <Skeleton className="h-10 w-32 rounded-t-lg" />
            </div>

            {/* Content Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <Skeleton className="h-6 w-40" />
                            <Skeleton className="h-8 w-8 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Skeleton className="h-8 w-20 rounded-lg" />
                            <Skeleton className="h-8 w-20 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
