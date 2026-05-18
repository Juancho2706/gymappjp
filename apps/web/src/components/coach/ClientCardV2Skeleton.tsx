'use client'

import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

export function ClientCardV2Skeleton({ className }: { className?: string }) {
    return (
        <GlassCard
            className={cn(
                'overflow-hidden border-border/50 bg-white/60 p-0 dark:border-white/10 dark:bg-zinc-950/50',
                className
            )}
        >
            <div className="animate-shimmer space-y-4 p-5 md:p-6">
                <div className="flex gap-4">
                    <div className="h-[72px] w-[72px] shrink-0 rounded-full bg-gradient-to-br from-zinc-200/80 to-zinc-100/40 dark:from-zinc-800 dark:to-zinc-900/60" />
                    <div className="flex-1 space-y-2">
                        <div className="h-5 w-3/5 max-w-[200px] rounded-md bg-zinc-200/80 dark:bg-zinc-800/80" />
                        <div className="h-3 w-4/5 max-w-[260px] rounded-md bg-zinc-200/60 dark:bg-zinc-800/60" />
                        <div className="h-6 w-24 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-16 rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50"
                        />
                    ))}
                </div>
                <div className="h-8 w-full rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50" />
                <div className="h-8 w-full rounded-lg bg-zinc-200/40 dark:bg-zinc-800/40" />
                <div className="h-20 w-full rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50" />
                <div className="flex flex-wrap gap-2 pt-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-10 min-w-[100px] flex-1 rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50"
                        />
                    ))}
                </div>
            </div>
        </GlassCard>
    )
}
