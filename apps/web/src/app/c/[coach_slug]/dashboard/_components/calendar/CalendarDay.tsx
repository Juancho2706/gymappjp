'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { scaleIn, staggerContainer, springs } from '@/lib/animation-presets'
import { Check } from 'lucide-react'

export interface CalendarDayProps {
    dayLabel: string
    dayNumber: number
    isToday: boolean
    hasWorkout: boolean
    isCompleted: boolean
    isPast: boolean
}

export function CalendarDaysRow({ days }: { days: CalendarDayProps[] }) {
    const reduce = useReducedMotion()
    if (reduce) {
        return (
            <div className="grid grid-cols-7 gap-1">
                {days.map((d) => (
                    <CalendarDay key={`${d.dayLabel}-${d.dayNumber}`} {...d} />
                ))}
            </div>
        )
    }
    return (
        <motion.div className="grid grid-cols-7 gap-1" variants={staggerContainer(0.04)} initial="hidden" animate="show">
            {days.map((d) => (
                <CalendarDay key={`${d.dayLabel}-${d.dayNumber}`} {...d} />
            ))}
        </motion.div>
    )
}

function CalendarDay({ dayLabel, dayNumber, isToday, hasWorkout, isCompleted, isPast }: CalendarDayProps) {
    const reduce = useReducedMotion()
    const base =
        'flex flex-col items-center gap-1.5 rounded-control py-2 text-[11px] font-semibold transition-colors sm:text-xs'
    let cell = `${base} text-subtle`
    if (isToday && hasWorkout) {
        cell = `${base} bg-[var(--cta-fill)] text-on-sport shadow-sm ring-2 ring-sport-500/40`
    } else if (isToday && !hasWorkout) {
        cell = `${base} bg-sport-500/15 text-sport-600`
    } else if (isPast && !isCompleted) {
        cell = `${base} text-subtle opacity-40`
    }

    const marker = (
        <span className="flex h-3 w-3 items-center justify-center">
            {isCompleted ? (
                <Check className="h-3.5 w-3.5 text-[var(--success-500)]" />
            ) : hasWorkout ? (
                <span className="h-1.5 w-1.5 rounded-full bg-sport-500/50" />
            ) : null}
        </span>
    )

    if (reduce) {
        return (
            <div className={cell}>
                <span className="font-display font-bold uppercase tracking-[-0.02em]">{dayLabel}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums">{dayNumber}</span>
                {marker}
            </div>
        )
    }

    return (
        <motion.div variants={scaleIn} transition={springs.snappy} className={cell}>
            <span className="font-display font-bold uppercase tracking-[-0.02em]">{dayLabel}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums">{dayNumber}</span>
            {marker}
        </motion.div>
    )
}
