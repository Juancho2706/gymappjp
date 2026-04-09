'use client'

import { motion } from 'framer-motion'
import { springs } from '@/lib/animation-presets'
import { Dumbbell } from 'lucide-react'

export function WorkoutLogItems({
    items,
}: {
    items: Array<{ dateLabel: string; sets: number; subtitle: string }>
}) {
    return (
        <div className="divide-y divide-border/30">
            {items.map((item, i) => (
                <motion.div
                    key={item.dateLabel}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...springs.smooth, delay: i * 0.05 }}
                    className="flex items-center gap-3 px-4 py-3"
                >
                    <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
                    >
                        <Dumbbell className="h-4 w-4" style={{ color: 'var(--theme-primary)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.dateLabel}</p>
                        <p className="text-[10px] text-muted-foreground">{item.subtitle}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{item.sets} se</span>
                </motion.div>
            ))}
        </div>
    )
}
