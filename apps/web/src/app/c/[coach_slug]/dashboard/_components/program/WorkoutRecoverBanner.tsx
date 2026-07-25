'use client'

import Link from 'next/link'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { useWorkoutLaunch } from '../launch/WorkoutLaunchMorph'

/**
 * Banner "Tienes N días pendientes esta semana" (dashboard). Es un trigger de lanzamiento MÁS del
 * ejecutor: al tocarlo dispara el mismo loader "Despegue" que el CTA y las day-cards (morph desde su
 * propio rect → burbuja → despegue → Inicio). Client component porque `ActiveProgramSection` es server
 * y el morph necesita el hook `useWorkoutLaunch`. Navega al MISMO href de recuperación de siempre.
 */
export function WorkoutRecoverBanner({
    href,
    pendingCount,
    dayOfWeek,
    dayLabel,
}: {
    href: string
    pendingCount: number
    dayOfWeek: number
    dayLabel: string
}) {
    const { launch } = useWorkoutLaunch()
    return (
        <Link
            href={href}
            onClick={(e) => {
                // Mismo destino; interceptamos para animar el Despegue mientras se navega.
                e.preventDefault()
                launch(e.currentTarget, href)
            }}
            className="group flex items-center gap-3 rounded-control border border-ember-200 bg-ember-100 px-3.5 py-3 transition-colors hover:bg-ember-200"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-[var(--text-on-ember)]">
                <RotateCcw className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-tight text-ember-700">
                    {pendingCount === 1 ? 'Tienes 1 día pendiente' : `Tienes ${pendingCount} días pendientes`} esta semana
                </p>
                <p className="mt-0.5 truncate text-[11.5px] font-semibold text-ember-700/80">
                    Recuperar Día {dayOfWeek} · {dayLabel}
                </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-ember-700 transition-transform group-hover:translate-x-0.5" />
        </Link>
    )
}
