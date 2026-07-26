'use client'

import { CountUpText } from '@/components/ui/count-up'

/**
 * P3: peso headline con count-up. El número lo interpola `CountUpText`
 * (MotionValue → DOM, sin estado React ni un setState por frame:
 * ver `components/ui/count-up.tsx`). Conserva 1 decimal + sufijo "kg".
 */
export function WeightHeadline({ value }: { value: number }) {
    return (
        <span className="font-display text-[28px] font-black leading-none tracking-[-0.03em] tabular-nums text-strong">
            <CountUpText value={value} format={(v) => v.toFixed(1)} />
            <span className="ml-1 text-[13px] font-semibold text-muted">kg</span>
        </span>
    )
}
