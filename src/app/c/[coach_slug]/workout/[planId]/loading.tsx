import { Skeleton } from '@/components/ui/skeleton'
import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'

export default function LoadingWorkoutExecution() {
    return (
        <ClientLoadingShell layout="fullscreen">
            {/* Top Section - Fixed Header & Progress */}
            <div className="flex-none bg-card border-b border-border/50 shadow-sm z-20 pb-4 pt-safe">
                <div className="px-4 py-3 md:px-8 max-w-3xl mx-auto w-full">
                    {/* Custom Header */}
                    <div className="flex items-center justify-between mb-4">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="w-10 h-10 rounded-full" />
                    </div>

                    {/* Progress and Timer */}
                    <div className="flex items-center justify-between mb-3">
                        <Skeleton className="h-4 w-32" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-24 rounded-lg" />
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <Skeleton className="w-full h-1.5 rounded-full" />
                </div>
            </div>

            {/* Main Content Area - Carousel */}
            <div className="flex-1 relative overflow-hidden bg-muted/10 w-full min-h-0">
                <div className="absolute inset-0 overflow-y-auto pb-32 pt-6 px-4 md:px-8">
                    <div className="max-w-xl mx-auto w-full space-y-6">
                        {/* Exercise Header Card Skeleton */}
                        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <Skeleton className="h-3 w-20 mb-2" />
                                    <Skeleton className="h-8 w-48" />
                                </div>
                                <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0" />
                            </div>

                            {/* Target Details Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="bg-muted/50 rounded-xl p-2.5 flex flex-col items-center">
                                        <Skeleton className="h-3 w-16 mb-1.5" />
                                        <Skeleton className="h-4 w-12" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Logger Section Skeleton */}
                        <div className="bg-card border border-border rounded-3xl p-2 md:p-4 shadow-sm">
                            <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-3 pb-3 pt-2 border-b border-border/50">
                                <Skeleton className="w-4 h-3 md:w-5" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="w-10 h-3 md:w-8" />
                            </div>

                            <div className="space-y-1 pt-2">
                                {[...Array(4)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center px-1.5 md:px-2 py-1.5"
                                    >
                                        <Skeleton className="w-4 h-4 md:w-5 rounded-full mx-auto" />
                                        <Skeleton className="h-9 md:h-9 w-full rounded-lg" />
                                        <Skeleton className="h-9 md:h-9 w-full rounded-lg" />
                                        <div className="w-8 flex justify-center">
                                            <Skeleton className="w-10 h-10 md:w-7 md:h-7 rounded-md" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation Fixed Bar Skeleton */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/20 p-4 z-40 pb-safe">
                <div className="max-w-xl mx-auto flex items-center gap-3">
                    <Skeleton className="h-14 w-14 rounded-2xl flex-shrink-0" />
                    <Skeleton className="flex-1 h-14 rounded-2xl" />
                </div>
            </div>
        </ClientLoadingShell>
    )
}
