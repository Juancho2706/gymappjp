'use client'

import { useReducedMotion } from 'framer-motion'

export const springs = {
    snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
    smooth: { type: 'spring' as const, stiffness: 200, damping: 25 },
    lazy: { type: 'spring' as const, stiffness: 80, damping: 20 },
    elastic: { type: 'spring' as const, stiffness: 500, damping: 25, restDelta: 0.001 },
}

export const staggerContainer = (staggerChildren = 0.06, delayChildren = 0) => ({
    hidden: {},
    show: { transition: { staggerChildren, delayChildren } },
})

export const fadeSlideUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
}

export const fadeSlideLeft = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
}

export const scaleIn = {
    hidden: { opacity: 0, scale: 0.85 },
    show: { opacity: 1, scale: 1 },
}

export function useAnimationVariant<T extends object>(fullVariant: T, reducedVariant?: Partial<T>): T {
    const reduced = useReducedMotion()
    if (!reduced) return fullVariant
    return { ...fullVariant, ...reducedVariant } as T
}
