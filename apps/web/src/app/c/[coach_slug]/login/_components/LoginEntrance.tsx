'use client'

import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { staggerContainer, fadeSlideUp } from '@/lib/animation-presets'

/**
 * Subtle mount entrance for the client login screen — the first impression of
 * the coach's brand. Logo, title and form fade/slide up in a gentle stagger.
 * Reduced-motion aware: renders fully visible with no transform.
 *
 * Children passed as <LoginEntrance.Item> are the staggered pieces.
 */
export function LoginEntrance({ children, className }: { children: ReactNode; className?: string }) {
    const reduce = useReducedMotion()
    if (reduce) {
        return <div className={className}>{children}</div>
    }
    return (
        <motion.div
            className={className}
            variants={staggerContainer(0.1, 0.05)}
            initial="hidden"
            animate="show"
        >
            {children}
        </motion.div>
    )
}

/**
 * Staggered child of <LoginEntrance>. Exported as a standalone named component
 * (NOT a `LoginEntrance.Item` static prop): the login page is an RSC, and static
 * properties on a client component are lost across the server/client boundary
 * (the server only sees a client-reference stub), so `LoginEntrance.Item` would
 * be `undefined` at render. Separate exports each cross the boundary cleanly.
 */
export function LoginEntranceItem({ children, className }: { children: ReactNode; className?: string }) {
    const reduce = useReducedMotion()
    if (reduce) {
        return <div className={className}>{children}</div>
    }
    return (
        <motion.div
            className={className}
            variants={fadeSlideUp}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
            {children}
        </motion.div>
    )
}
