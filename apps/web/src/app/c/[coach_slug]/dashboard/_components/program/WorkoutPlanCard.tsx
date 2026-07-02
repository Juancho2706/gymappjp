'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, Play } from 'lucide-react'
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
        // Carrusel horizontal de day-cards 96px (kit alumno-dashboard.jsx:413-424).
        <div className="hide-scrollbar -ml-0.5 flex gap-2 overflow-x-auto pl-0.5">
            {plans.map((p) => {
                const dow = p.day_of_week ?? 1
                const isToday = dow === todayDow
                const done = isToday && workoutLoggedToday
                return (
                    <Link
                        key={p.id}
                        href={`${base}/workout/${p.id}`}
                        className={cn(
                            'block w-24 shrink-0 rounded-control border p-3 transition-colors',
                            isToday ? 'border-sport-500 bg-sport-100' : 'border-subtle bg-surface-card hover:bg-surface-sunken'
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span
                                className={cn(
                                    'text-[10.5px] font-extrabold uppercase tracking-wide',
                                    isToday ? 'text-sport-600' : 'text-subtle'
                                )}
                            >
                                {DAYS[dow - 1]}
                            </span>
                            {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-500)]" />
                            ) : isToday ? (
                                <Play className="h-3 w-3 shrink-0 text-sport-600" />
                            ) : (
                                <ChevronRight className="h-[13px] w-[13px] shrink-0 text-[var(--ink-300)]" />
                            )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-tight text-strong">{p.title}</p>
                        <p className="mt-0.5 text-[10.5px] text-subtle">Día {dow}</p>
                    </Link>
                )
            })}
        </div>
    )
}
