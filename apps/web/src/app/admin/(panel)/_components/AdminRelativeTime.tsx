'use client'

import { useEffect, useState } from 'react'
import { formatDistance } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * "hace 3 días" para el panel admin, calculado SOLO en el cliente.
 *
 * Un relativo no se puede formatear en SSR: depende del reloj del render, y el HTML lo genera
 * Vercel milisegundos (o segundos) antes de que el navegador hidrate ⇒ `formatDistanceToNow`
 * devolvía textos distintos en servidor y cliente y React marcaba hydration mismatch en cada
 * carga (Sentry EVA-NEXTJS-18, /admin/coaches). Mismo patrón que `LastActivityDays` en
 * `CoachTable`: `useState(null)` + `useEffect` ⇒ el primer render (el que se compara contra el
 * HTML) no imprime ninguna fecha; el texto real aparece recién tras montar.
 *
 * El texto final es idéntico al que daba `formatDistanceToNow(iso, { addSuffix: true, locale: es })`.
 */
export function AdminRelativeTime({
    iso,
    className,
}: {
    iso: string
    className?: string
}) {
    const [nowMs, setNowMs] = useState<number | null>(null)

    useEffect(() => {
        setNowMs(Date.now())
    }, [])

    if (nowMs === null) {
        return (
            <span className={className} aria-hidden>
                …
            </span>
        )
    }

    return (
        <span className={className}>
            {formatDistance(new Date(iso), new Date(nowMs), { addSuffix: true, locale: es })}
        </span>
    )
}
