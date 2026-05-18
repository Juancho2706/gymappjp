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
        'flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition-colors sm:text-xs'
    let cell = `${base} text-muted-foreground`
    if (isToday && hasWorkout) {
        cell = `${base} bg-[color:var(--theme-primary)] text-white shadow-sm ring-2 ring-[color:var(--theme-primary)]/40`
    } else if (isToday && !hasWorkout) {
        cell = `${base} bg-[color:var(--theme-primary)]/15 text-[color:var(--theme-primary)]`
    } else if (isPast && !isCompleted) {
        cell = `${base} text-muted-foreground/40`
    }

    if (reduce) {
        return (
            <div className={cell}>
                <span className="font-bold uppercase">{dayLabel}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm">{dayNumber}</span>
                <span className="flex h-3 w-3 items-center justify-center">
                    {isCompleted ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : hasWorkout ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--theme-primary)]/50" />
                    ) : null}
                </span>
            </div>
        )
    }

    return (
        <motion.div variants={scaleIn} transition={springs.snappy} className={cell}>
            <span className="font-bold uppercase">{dayLabel}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm">{dayNumber}</span>
            <span className="flex h-3 w-3 items-center justify-center">
                {isCompleted ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : hasWorkout ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--theme-primary)]/50" />
                ) : null}
            </span>
        </motion.div>
    )
}
