'use client'

import { useTimeOfDayGreeting } from '../../_hooks/useTimeOfDayGreeting'

interface Props {
    coachName: string
    pendingCount: number
}

export function GreetingHeader({ coachName, pendingCount }: Props) {
    const greeting = useTimeOfDayGreeting()
    const firstName = coachName?.split(' ')[0] || 'Coach'
    const dateStr = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    })

    return (
        <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{dateStr}</p>
            <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-[var(--text-strong)] sm:text-4xl">
                {greeting}, <span className="text-sport-500">{firstName}</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
                {pendingCount > 0
                    ? `Tienes ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} hoy.`
                    : 'Todo al dia. Buen momento para planificar.'}
            </p>
        </div>
    )
}
