'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/** Pulso suave en banner atrasado (§12 a11y: respeta "reducir movimiento"). */
export function CheckInBannerFrame({ overdue, className, children }: { overdue: boolean; className?: string; children: ReactNode }) {
    const reduce = useReducedMotion()
    if (!overdue || reduce) {
        return <div className={className}>{children}</div>
    }
    return (
        <motion.div
            className={className}
            animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.35)', '0 0 0 6px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0.35)'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
            {children}
        </motion.div>
    )
}
