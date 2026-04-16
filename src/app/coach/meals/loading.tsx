import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function CoachMealsLoading() {
    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
            <Skeleton className="h-10 w-48" />
            <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <GlassCard key={i} className="p-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="mt-3 h-4 w-1/2" />
                    </GlassCard>
                ))}
            </div>
        </div>
    )
}
