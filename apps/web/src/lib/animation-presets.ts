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

export const easings = {
    ringFill: [0.22, 1, 0.36, 1] as const,
    dirSlide: [0.16, 1, 0.3, 1] as const,
}

export const springsSheet = {
    enter: { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 },
} as const

export const springsRow = { type: 'spring', stiffness: 400, damping: 30 } as const

