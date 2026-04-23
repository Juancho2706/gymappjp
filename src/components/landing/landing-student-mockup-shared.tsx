'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Apple, CheckCircle2, Dumbbell, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StudentTabValue = 'home' | 'nutrition' | 'learn' | 'checkin'

const STUDENT_NAV = [
    { value: 'home' as const, icon: Home },
    { value: 'nutrition' as const, icon: Apple },
    { value: 'learn' as const, icon: Dumbbell },
    { value: 'checkin' as const, icon: CheckCircle2 },
]

export function useAnimationTick(ms: number, enabled = true) {
    const [n, setN] = useState(0)
    const reduce = useReducedMotion()
    useEffect(() => {
        if (reduce || !enabled) return
        const id = window.setInterval(() => setN((x) => x + 1), ms)
        return () => clearInterval(id)
    }, [ms, reduce, enabled])
    return n
}

/** When `enabled` is false, no interval runs (e.g. hero static mock M2). */
export function useLoopPhase(periodMs: number, stepMs: number, enabled = true) {
    const t = useAnimationTick(stepMs, enabled)
    const reduce = useReducedMotion()
    if (reduce || !enabled) return 0.5
    return ((t * stepMs) % periodMs) / periodMs
}

export function RingValue({
    label,
    value,
    displayValue,
    tone = 'primary',
    strokeHex,
    subLabel,
    /** Narrow layouts (e.g. landing hero): smaller ring + label. */
    compact = false,
}: {
    label: string
    value: number
    displayValue: string
    tone?: 'primary' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose'
    strokeHex?: string
    subLabel?: string
    compact?: boolean
}) {
    const size = compact ? 48 : 64
    const stroke = compact ? 6 : 7
    const radius = (size - stroke) / 2
    const circ = 2 * Math.PI * radius
    const colors: Record<string, string> = {
        primary: 'stroke-primary',
        emerald: 'stroke-emerald-500',
        amber: 'stroke-amber-500',
        sky: 'stroke-sky-500',
        violet: 'stroke-violet-500',
        rose: 'stroke-rose-500',
    }
    const v = Math.min(100, Math.max(0, value))
    const off = circ * (1 - v / 100)
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col items-center',
                compact ? 'gap-1' : 'gap-1.5'
            )}
        >
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                        className="stroke-muted-foreground/25"
                        fill="none"
                    />
                    <motion.circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="none"
                        className={strokeHex ? '' : colors[tone]}
                        style={strokeHex ? { stroke: strokeHex } : undefined}
                        strokeDasharray={circ}
                        animate={{ strokeDashoffset: off }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span
                        className={cn(
                            'font-display font-black tabular-nums text-foreground',
                            compact ? 'text-[11px]' : 'text-sm'
                        )}
                    >
                        {displayValue}
                    </span>
                </div>
            </div>
            <div className={cn('w-full text-center', compact && 'max-w-[4.75rem]')}>
                <span
                    className={cn(
                        'block font-black uppercase tracking-wide text-muted-foreground',
                        compact ? 'text-[7px] leading-tight' : 'text-[9px]'
                    )}
                >
                    {label}
                </span>
                {subLabel ? (
                    <span
                        className={cn(
                            'text-muted-foreground/70 tabular-nums',
                            compact ? 'text-[7px]' : 'text-[8px]'
                        )}
                    >
                        {subLabel}
                    </span>
                ) : null}
            </div>
        </div>
    )
}

export function PhoneFrame({
    children,
    className,
    /**
     * `heroChrome`: landing hero — dark mode uses charcoal zinc bezel instead of bright white.
     */
    bezel = 'default',
}: {
    children: React.ReactNode
    /** e.g. hero: tighter max-width */
    className?: string
    bezel?: 'default' | 'heroChrome'
}) {
    const shell =
        bezel === 'heroChrome'
            ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-600 dark:bg-zinc-800'
            : 'border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100'
    const notch =
        bezel === 'heroChrome' ? 'bg-zinc-700 dark:bg-zinc-500' : 'bg-zinc-700 dark:bg-zinc-300'

    return (
        <div className={cn('mx-auto w-full max-w-[300px]', className)}>
            <div className={cn('relative rounded-[2rem] border-[8px] p-0 shadow-2xl', shell)}>
                <div className={cn('absolute left-1/2 top-1 z-10 h-4 w-20 -translate-x-1/2 rounded-full', notch)} />
                <div
                    className="relative overflow-hidden rounded-[1.5rem] bg-background"
                    style={{ aspectRatio: '9/18.5' }}
                >
                    <div className="absolute inset-0 flex flex-col">{children}</div>
                </div>
            </div>
        </div>
    )
}

export function PhoneHeader({
    title,
    right,
    className,
}: {
    title: string
    right?: React.ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                'shrink-0 border-b border-border/60 bg-background/95 px-3 pb-2 pt-6 backdrop-blur-sm',
                className
            )}
        >
            <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 truncate font-display text-sm font-black tracking-tight text-foreground">
                    {title}
                </p>
                {right}
            </div>
        </div>
    )
}

export function PhoneBottomNav({ active }: { active: StudentTabValue }) {
    return (
        <div className="mt-auto shrink-0 border-t border-border/60 bg-background/95 px-1 pb-2 pt-1.5">
            <div className="flex items-stretch justify-around gap-0.5">
                {STUDENT_NAV.map((n) => {
                    const Icon = n.icon
                    const on = n.value === active
                    return (
                        <div
                            key={n.value}
                            className={cn(
                                'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-0.5 transition-colors',
                                on ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400'
                            )}
                        >
                            {on ? (
                                <span
                                    className="absolute -top-1.5 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-primary"
                                    aria-hidden
                                />
                            ) : null}
                            <span
                                className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-full',
                                    on && 'bg-primary/12 dark:bg-primary/20'
                                )}
                            >
                                <Icon
                                    className="h-[18px] w-[18px]"
                                    strokeWidth={on ? 2.4 : 2}
                                />
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
