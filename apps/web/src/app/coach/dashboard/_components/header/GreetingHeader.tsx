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
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{dateStr}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {greeting}, <span style={{ color: 'var(--theme-primary, #007AFF)' }}>{firstName}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
                {pendingCount > 0
                    ? `Tienes ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} hoy.`
                    : 'Todo al dia. Buen momento para planificar.'}
            </p>
        </div>
    )
}
