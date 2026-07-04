'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBasePath } from '@/components/client/BasePathProvider'
import type { WeekDayStatus } from '../../_data/weekPendingWorkouts'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export type WorkoutPlanCardItem = {
    id: string
    title: string
    day_of_week: number | null
    /** Estado del día en la semana actual (derivado en el server, ver `deriveWeekWorkoutStatus`). */
    status: WeekDayStatus
    /** True si esta card es el día de HOY (mantiene el realce aunque ya esté hecho). */
    isToday: boolean
}

export function WorkoutPlanCards({
    coachSlug,
    plans,
}: {
    coachSlug: string
    plans: WorkoutPlanCardItem[]
}) {
    const base = useBasePath(`/c/${coachSlug}`)
    return (
        // Carrusel horizontal de day-cards 96px (kit alumno-dashboard.jsx:413-424).
        <div className="hide-scrollbar -ml-0.5 flex gap-2 overflow-x-auto pl-0.5">
            {plans.map((p) => {
                const dow = p.day_of_week ?? 1
                const done = p.status === 'done'
                const pending = p.status === 'pending'
                const isToday = p.isToday
                return (
                    <Link
                        key={p.id}
                        href={`${base}/workout/${p.id}`}
                        aria-label={
                            pending
                                ? `${p.title} · pendiente, recuperar`
                                : isToday
                                  ? `${p.title} · hoy`
                                  : p.title
                        }
                        className={cn(
                            'block w-24 shrink-0 rounded-control border p-3 transition-colors',
                            isToday
                                ? 'border-sport-500 bg-sport-100'
                                : pending
                                  ? 'border-ember-200 bg-ember-100 hover:bg-ember-200'
                                  : 'border-subtle bg-surface-card hover:bg-surface-sunken'
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span
                                className={cn(
                                    'text-[10.5px] font-extrabold uppercase tracking-wide',
                                    isToday ? 'text-sport-600' : pending ? 'text-ember-700' : 'text-subtle'
                                )}
                            >
                                {DAYS[dow - 1]}
                            </span>
                            {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-500)]" />
                            ) : isToday ? (
                                <Play className="h-3 w-3 shrink-0 text-sport-600" />
                            ) : pending ? (
                                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ember-500" />
                            ) : (
                                <ChevronRight className="h-[13px] w-[13px] shrink-0 text-[var(--ink-300)]" />
                            )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-tight text-strong">{p.title}</p>
                        <p
                            className={cn(
                                'mt-0.5 text-[10.5px]',
                                pending ? 'font-bold text-ember-700' : 'text-subtle'
                            )}
                        >
                            {pending ? 'Pendiente' : `Día ${dow}`}
                        </p>
                    </Link>
                )
            })}
        </div>
    )
}
