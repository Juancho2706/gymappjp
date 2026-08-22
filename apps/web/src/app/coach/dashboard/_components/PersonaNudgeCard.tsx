'use client'

import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'

/**
 * «Elige tu especialidad y ordenamos tu panel» — tarjeta para el coach que todavía no contestó
 * «¿A qué te dedicas?» (SPEC coach-onboarding-v2 §1, decisión D8).
 *
 * Los coaches con alumnos NO pasan por el gate de la pantalla completa: se les ofrece acá, sin
 * bloquear nada. Mientras tanto la guía usa los pasos de `other` (el panel completo), así que el
 * coach nunca queda sin siguiente paso.
 */
export function PersonaNudgeCard() {
    return (
        <Link
            href="/coach/onboarding/persona"
            className="flex items-center gap-3 rounded-card border border-[var(--sport-200)] bg-[var(--sport-100)] px-3.5 py-3 transition-colors hover:bg-[var(--sport-200)]"
        >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sport-500)] text-white">
                <Compass className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold text-[var(--sport-700)]">
                    Elige tu especialidad y ordenamos tu panel
                </div>
                <div className="mt-0.5 text-[12.5px] text-[var(--sport-700)] opacity-85">
                    Un minuto: dejamos a la vista lo que usas y guardamos el resto.
                </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-[var(--sport-700)]" />
        </Link>
    )
}
