import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function CoachRecipesLoading() {
    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <Skeleton className="h-10 w-56" />
                <Skeleton className="h-11 w-full rounded-xl sm:max-w-xs" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <GlassCard key={i} className="overflow-hidden p-0">
                        <Skeleton className="aspect-video w-full" />
                        <div className="space-y-2 p-4">
                            <Skeleton className="h-5 w-4/5" />
                            <Skeleton className="h-4 w-1/3" />
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    )
}
