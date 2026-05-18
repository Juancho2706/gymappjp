'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, ChevronRight } from 'lucide-react'
import { fadeSlideLeft, staggerContainer, springs } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'

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
    return (
        <motion.div className="grid grid-cols-1 gap-2" variants={staggerContainer(0.05)} initial="hidden" animate="show">
            {plans.map((p, i) => {
                const dow = p.day_of_week ?? 1
                const isToday = dow === todayDow
                const done = isToday && workoutLoggedToday
                return (
                    <motion.div key={p.id} variants={fadeSlideLeft} transition={springs.smooth} custom={i}>
                        <Link href={`/c/${coachSlug}/workout/${p.id}`}>
                            <motion.div
                                whileHover={{ x: 4 }}
                                className={cn(
                                    'flex items-center gap-4 rounded-xl border p-3 transition-colors',
                                    isToday
                                        ? 'border-[color:var(--theme-primary)]/30 bg-[color:var(--theme-primary)]/10'
                                        : 'border-border bg-card hover:bg-accent/50'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-bold',
                                        isToday ? 'text-white' : 'text-[color:var(--theme-primary)]'
                                    )}
                                    style={
                                        isToday
                                            ? { backgroundColor: 'var(--theme-primary)', borderColor: 'var(--theme-primary)' }
                                            : {
                                                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                                                  borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)',
                                              }
                                    }
                                >
                                    <span>{DAYS[dow - 1]}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{p.title}</p>
                                    <p className="text-[10px] text-muted-foreground">Día {dow}</p>
                                </div>
                                {done ? <Check className="h-5 w-5 shrink-0 text-emerald-500" /> : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
                            </motion.div>
                        </Link>
                    </motion.div>
                )
            })}
        </motion.div>
    )
}
