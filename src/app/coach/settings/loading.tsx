import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingSettings() {
    return (
        <div className="p-4 md:p-8 max-w-3xl animate-in fade-in duration-500 space-y-8">
            <div className="space-y-2">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="space-y-6">
                {/* Logo Section Skeleton */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <Skeleton className="h-6 w-32" />
                    <div className="flex items-center gap-6">
                        <Skeleton className="w-24 h-24 rounded-xl" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    </div>
                </div>

                {/* Form Section Skeleton */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
                    <Skeleton className="h-6 w-40" />
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-10 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-11 w-full rounded-xl" />
                </div>
            </div>
        </div>
    )
}
