'use client'

import { formatLongDateSantiago, timeGreetingSantiago } from '@/lib/date-utils'

interface Props {
    coachName: string
    pendingCount: number
}

export function GreetingHeader({ coachName, pendingCount }: Props) {
    // EVA-NEXTJS-18: fecha y saludo se derivaban del reloj del RUNTIME. El servidor corre en
    // UTC y el coach está en Chile (UTC-4/-3), así que de noche el HTML del server decía
    // "Domingo, 9 de agosto · Buenos días" y el navegador "Sábado, 8 de agosto · Buenas
    // noches" → hydration error. Fijar Santiago hace que ambos lados calculen lo mismo.
    const greeting = timeGreetingSantiago()
    const firstName = coachName?.split(' ')[0] || 'Coach'
    const dateStr = formatLongDateSantiago()

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
