'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'

/**
 * Numero con count-up (mismo patron que ComplianceRing: useMotionValue + useSpring{60,20} +
 * useMotionValueEvent). reduced-motion => salta al valor final (sin animar). `format` recibe el
 * valor interpolado y devuelve el texto mostrado (ej. `(v) => v.toFixed(1) + '%'`).
 */
export function CountUpValue({
    value,
    format,
    className,
}: {
    value: number
    format: (v: number) => string
    className?: string
}) {
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

    return <span className={className}>{format(reduce ? value : animated)}</span>
}
