import { ClientCardV2Skeleton } from '@/components/coach/ClientCardV2Skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'

export default function CoachClientsLoading() {
    return (
        <div className="max-w-[1600px] space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-56 md:h-12 md:w-72" />
                    <Skeleton className="h-4 w-full max-w-md" />
                </div>
                <Skeleton className="h-14 w-full rounded-xl md:w-48" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                    <GlassCard key={i} className="h-24 p-4">
                        <Skeleton className="h-full w-full rounded-lg" />
                    </GlassCard>
                ))}
            </div>

            <div className="rounded-2xl border border-border/50 p-4 backdrop-blur-xl dark:border-white/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <Skeleton className="h-11 flex-1 rounded-xl" />
                    <div className="flex gap-2">
                        <Skeleton className="h-11 w-28 rounded-xl" />
                        <Skeleton className="h-11 w-40 rounded-xl" />
                        <Skeleton className="h-11 w-24 rounded-xl" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 xl:gap-8">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <ClientCardV2Skeleton key={i} />
                ))}
            </div>
        </div>
    )
}
