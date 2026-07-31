'use client'

import Link from 'next/link'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { useWorkoutLaunch } from '../launch/WorkoutLaunchMorph'

/**
 * Banner "Tienes N días pendientes esta semana" (dashboard). Es un trigger de lanzamiento MÁS del
 * ejecutor: al tocarlo dispara el mismo loader "Despegue" que el CTA y las day-cards (morph desde su
 * propio rect → burbuja → despegue → Inicio). Client component porque `ActiveProgramSection` es server
 * y el morph necesita el hook `useWorkoutLaunch`. Navega al MISMO href de recuperación de siempre.
 *
 * La cola incluye los días pasados EMPEZADOS a medias (`in_progress`, spec `workout-day-in-progress`):
 * el verbo del CTA cambia a "Continuar" cuando el más antiguo ya tiene series registradas.
 */
export function WorkoutRecoverBanner({
    href,
    pendingCount,
    dayOfWeek,
    dayLabel,
    oldestStatus = 'pending',
}: {
    href: string
    pendingCount: number
    dayOfWeek: number
    dayLabel: string
    /** Estado del día del CTA: sin nada registrado (`pending`) o a medias (`in_progress`). */
    oldestStatus?: 'pending' | 'in_progress'
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
            className="group flex items-center gap-3 rounded-control border border-warning-500/25 bg-warning-100 px-3.5 py-3 transition-colors hover:bg-warning-500/20"
        >
            {/* `#1A1205` fijo: `--warning-500` es el mismo ámbar (#F5A524) en light y dark, así que el
                ícono necesita tinta oscura en ambos esquemas. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-500 text-[#1A1205]">
                <RotateCcw className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-tight text-warning-700">
                    {pendingCount === 1 ? 'Tienes 1 día pendiente' : `Tienes ${pendingCount} días pendientes`} esta semana
                </p>
                <p className="mt-0.5 truncate text-[11.5px] font-semibold text-warning-700/80">
                    {oldestStatus === 'in_progress' ? 'Continuar' : 'Recuperar'} Día {dayOfWeek} · {dayLabel}
                </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-warning-700 transition-transform group-hover:translate-x-0.5" />
        </Link>
    )
}
