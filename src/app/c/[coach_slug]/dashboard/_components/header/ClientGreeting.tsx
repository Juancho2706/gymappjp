'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { fadeSlideUp, staggerContainer, springs } from '@/lib/animation-presets'

interface ClientGreetingProps {
    greeting: string
    dateLabel: string
}

export function ClientGreeting({ greeting, dateLabel }: ClientGreetingProps) {
    const reduce = useReducedMotion()
    const words = greeting.split(' ')
    if (reduce) {
        return (
            <div className="min-w-0">
                <p className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{dateLabel}</p>
                <h1 className="truncate font-display text-xl font-bold text-foreground">{greeting}</h1>
            </div>
        )
    }
    return (
        <div className="min-w-0">
            <motion.p
                className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={springs.snappy}
            >
                {dateLabel}
            </motion.p>
            <motion.h1
                className="truncate font-display text-xl font-bold text-foreground"
                variants={staggerContainer(0.04)}
                initial="hidden"
                animate="show"
            >
                {words.map((w, i) => (
                    <motion.span key={`${w}-${i}`} variants={fadeSlideUp} transition={springs.snappy} className="mr-1 inline-block">
                        {w}
                    </motion.span>
                ))}
            </motion.h1>
        </div>
    )
}
