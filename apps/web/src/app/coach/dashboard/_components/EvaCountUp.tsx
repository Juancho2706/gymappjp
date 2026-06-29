'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
    value: number
    suffix?: string
    /** ms */
    duration?: number
}

/**
 * EvaCountUp — animated integer count-up for hero/KPI metrics (design parity with
 * the EVA_DATA <EvaCountUp> helper). Eases out; respects prefers-reduced-motion.
 */
export function EvaCountUp({ value, suffix = '', duration = 820 }: Props) {
    const [display, setDisplay] = useState(0)
    const rafRef = useRef<number | null>(null)

    useEffect(() => {
        const reduce =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduce || value === 0) {
            setDisplay(value)
            return
        }
        const start = performance.now()
        const from = 0
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            // easeOutCubic
            const eased = 1 - Math.pow(1 - t, 3)
            setDisplay(Math.round(from + (value - from) * eased))
            if (t < 1) rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [value, duration])

    return (
        <>
            {display}
            {suffix}
        </>
    )
}
