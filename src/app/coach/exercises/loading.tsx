import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingExercises() {
    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="h-4 w-56" />
                </div>
            </div>

            {/* Filter/Search Bar Skeleton */}
            <div className="flex flex-col md:flex-row gap-4">
                <Skeleton className="h-10 flex-1 rounded-xl" />
                <Skeleton className="h-10 w-full md:w-48 rounded-xl" />
            </div>

            {/* Content List Skeleton */}
            <div className="space-y-6">
                {[...Array(3)].map((_, groupIdx) => (
                    <div key={groupIdx} className="space-y-4">
                        <Skeleton className="h-7 w-40" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="bg-card border border-border rounded-xl p-4 flex gap-4">
                                    <Skeleton className="w-16 h-16 rounded-lg flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
