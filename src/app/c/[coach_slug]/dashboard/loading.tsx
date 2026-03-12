import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingClientDashboard() {
    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border px-4 py-4 flex items-center justify-between">
                <div>
                    <Skeleton className="h-3 w-20 mb-2" />
                    <Skeleton className="h-6 w-32" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
            </header>

            <main className="px-4 py-6 space-y-6 max-w-lg mx-auto">
                {/* Calendario Semanal Skeleton */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex justify-between items-center w-full max-w-sm mx-auto">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-1.5">
                                <Skeleton className="h-3 w-4" />
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <Skeleton className="w-1 h-1 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Today's workout CTA Skeleton */}
                    <div className="bg-card border border-border rounded-2xl p-5 h-full">
                        <div className="flex items-start justify-between mb-3">
                            <Skeleton className="w-10 h-10 rounded-xl" />
                            <Skeleton className="w-5 h-5 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-24 mb-2" />
                        <Skeleton className="h-5 w-40 mb-3" />
                        <Skeleton className="h-6 w-28 rounded-lg" />
                    </div>

                    {/* Nutrition CTA Skeleton */}
                    <div className="bg-card border border-border rounded-2xl p-5 h-full">
                        <div className="flex items-start justify-between mb-3">
                            <Skeleton className="w-10 h-10 rounded-xl" />
                            <Skeleton className="w-5 h-5 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-24 mb-2" />
                        <Skeleton className="h-5 w-40 mb-3" />
                        <Skeleton className="h-6 w-28 rounded-lg" />
                    </div>
                </div>

                {/* Recent plans Skeleton */}
                <div className="space-y-6 mt-6">
                    <div className="space-y-3">
                        <Skeleton className="h-3 w-24 mb-2" />
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="bg-card border border-border shadow-sm rounded-xl px-4 py-3 flex items-center gap-3">
                                    <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                                    <div className="flex-1">
                                        <Skeleton className="h-4 w-3/4 mb-1" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                    <Skeleton className="w-4 h-4 rounded-full" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
