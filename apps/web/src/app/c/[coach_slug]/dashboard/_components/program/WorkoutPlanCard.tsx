'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, ChevronRight } from 'lucide-react'
import { fadeSlideLeft, staggerContainer, springs } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'
import { useBasePath } from '@/components/client/BasePathProvider'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function WorkoutPlanCards({
    coachSlug,
    plans,
    todayDow,
    workoutLoggedToday,
}: {
    coachSlug: string
    plans: Array<{ id: string; title: string; day_of_week: number | null }>
    todayDow: number
    /** True si hubo entreno registrado hoy (plan del día). */
    workoutLoggedToday: boolean
}) {
    const base = useBasePath(`/c/${coachSlug}`)
    return (
        <motion.div className="grid grid-cols-1 gap-2" variants={staggerContainer(0.05)} initial="hidden" animate="show">
            {plans.map((p, i) => {
                const dow = p.day_of_week ?? 1
                const isToday = dow === todayDow
                const done = isToday && workoutLoggedToday
                return (
                    <motion.div key={p.id} variants={fadeSlideLeft} transition={springs.smooth} custom={i}>
                        <Link href={`${base}/workout/${p.id}`}>
                            <motion.div
                                whileHover={{ x: 4 }}
                                className={cn(
                                    'flex items-center gap-4 rounded-control border p-3 transition-colors',
                                    isToday
                                        ? 'border-sport-500/30 bg-sport-500/10'
                                        : 'border-subtle bg-surface-card hover:bg-surface-sunken'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-control border-[1.5px] font-display text-xs font-bold',
                                        isToday
                                            ? 'border-transparent bg-[var(--cta-fill)] text-on-sport'
                                            : 'border-sport-500/25 bg-sport-500/10 text-sport-600'
                                    )}
                                >
                                    <span>{DAYS[dow - 1]}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-strong">{p.title}</p>
                                    <p className="text-[10px] text-muted">Día {dow}</p>
                                </div>
                                {done ? <Check className="h-5 w-5 shrink-0 text-[var(--success-500)]" /> : <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ink-300)]" />}
                            </motion.div>
                        </Link>
                    </motion.div>
                )
            })}
        </motion.div>
    )
}
