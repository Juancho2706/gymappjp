'use client'

import { Dumbbell } from 'lucide-react'
import { RevealStagger, RevealItem } from '@/components/motion/Reveal'

/**
 * P7: filas en `RevealStagger` (cascada whileInView, barata: solo opacity/transform),
 * cada fila un `RevealItem variant="fadeUp"`. Reduced-motion aware vía el toolkit Reveal.
 */
export function WorkoutLogItems({
    items,
}: {
    items: Array<{ dayKey: string; dateLabel: string; sets: number; subtitle: string }>
}) {
    return (
        <RevealStagger className="divide-y divide-border/30">
            {items.map((item) => (
                <RevealItem key={item.dayKey} variant="fadeUp">
                    <div className="flex items-center gap-3 px-4 py-3">
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
                        <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-muted-foreground">
                            {item.sets} {item.sets === 1 ? 'serie' : 'series'}
                        </span>
                    </div>
                </RevealItem>
            ))}
        </RevealStagger>
    )
}
