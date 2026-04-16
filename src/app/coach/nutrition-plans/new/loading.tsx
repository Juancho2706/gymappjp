import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function NutritionPlanNewLoading() {
    return (
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6">
            <Skeleton className="h-10 w-64" />
            <GlassCard className="grid min-h-[520px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                </div>
                <Skeleton className="min-h-[400px] rounded-xl" />
            </GlassCard>
        </div>
    )
}
