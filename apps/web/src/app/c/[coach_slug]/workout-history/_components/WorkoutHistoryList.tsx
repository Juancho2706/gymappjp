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
        <RevealStagger stagger={0.04}>
            {items.map((item, i) => (
                <RevealItem key={item.dayKey} variant="fadeUp">
                    {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                    <div className="flex items-center gap-3 px-3.5 py-[13px]">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-sunken">
                            <Dumbbell className="h-[17px] w-[17px]" style={{ color: 'var(--theme-primary)' }} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[14.5px] font-bold capitalize text-strong">{item.dateLabel}</p>
                            <p className="text-[12.5px] text-muted">{item.subtitle}</p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap rounded-pill bg-surface-sunken px-2.5 py-1 font-mono text-[12.5px] font-bold text-strong">
                            {item.sets === 1 ? '1 serie' : `${item.sets} series`}
                        </span>
                    </div>
                </RevealItem>
            ))}
        </RevealStagger>
    )
}
