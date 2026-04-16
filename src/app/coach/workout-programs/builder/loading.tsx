import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function WorkoutProgramsBuilderLoading() {
    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
            <Skeleton className="h-10 w-56" />
            <GlassCard className="space-y-4 p-6">
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <div className="flex gap-3">
                    <Skeleton className="h-11 flex-1 rounded-xl" />
                    <Skeleton className="h-11 w-32 rounded-xl" />
                </div>
            </GlassCard>
        </div>
    )
}
