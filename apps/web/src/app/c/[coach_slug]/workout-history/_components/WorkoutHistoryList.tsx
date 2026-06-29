'use client'

import { Dumbbell } from 'lucide-react'
import { RevealStagger, RevealItem } from '@/components/motion/Reveal'
import type { WorkoutLogDaySummary } from '@/app/c/[coach_slug]/dashboard/_data/dashboard.queries'

/**
 * History list for the dedicated workout-history page.
 * Rows fade/slide up as they scroll into view (whileInView, cheap) via the
 * shared scroll-reveal toolkit — reduced-motion aware. Kept separate from the
 * dashboard's <WorkoutLogItems> (RecentWorkoutsSection) so each surface owns
 * its own entrance treatment.
 */
export function WorkoutHistoryList({ items }: { items: WorkoutLogDaySummary[] }) {
    return (
        <RevealStagger className="divide-y divide-border/30" stagger={0.04}>
            {items.map((item) => (
                <RevealItem key={item.dayKey} variant="fadeUp">
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
                        >
                            <Dumbbell className="h-4 w-4" style={{ color: 'var(--theme-primary)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{item.dateLabel}</p>
                            <p className="text-[10px] text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-muted-foreground">
                            {item.sets} {item.sets === 1 ? 'serie' : 'series'}
                        </span>
                    </div>
                </RevealItem>
            ))}
        </RevealStagger>
    )
}
