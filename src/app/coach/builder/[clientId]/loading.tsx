import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function CoachBuilderLoading() {
    return (
        <div className="mx-auto max-w-[1800px] space-y-6 px-4 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <Skeleton className="h-10 w-48" />
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-24 rounded-lg" />
                    <Skeleton className="h-10 w-24 rounded-lg" />
                </div>
            </div>
            <GlassCard className="grid min-h-[480px] grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr]">
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <Skeleton key={i} className="min-h-[320px] rounded-xl" />
                    ))}
                </div>
            </GlassCard>
        </div>
    )
}
