'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'

/**
 * P3: peso headline con count-up (mismo patrón que ComplianceRing.tsx:
 * useMotionValue + useSpring{60,20} + useMotionValueEvent; reduced-motion → salto al valor final).
 */
export function WeightHeadline({ value }: { value: number }) {
    const reduce = useReducedMotion()
    const [animated, setAnimated] = useState(reduce ? value : 0)
    const mv = useMotionValue(0)
    const spring = useSpring(mv, { stiffness: 60, damping: 20 })

    useEffect(() => {
        if (reduce) {
            setAnimated(value)
            return
        }
        mv.set(value)
    }, [value, mv, reduce])

    useMotionValueEvent(spring, 'change', (v) => {
        setAnimated(v)
    })

    const display = reduce ? value : animated

    return (
        <span className="font-display text-3xl font-black tabular-nums text-foreground">{display.toFixed(1)} kg</span>
    )
}
