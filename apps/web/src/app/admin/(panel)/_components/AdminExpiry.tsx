'use client'

import { useEffect, useState } from 'react'
import { expiryCountdownLabel, expiryToneClass, formatExpiryStamp } from './expiry-format'

/**
 * «Vence» del panel admin: día y hora EXACTOS en Chile + cuánto falta.
 *
 * Recibe el instante REAL (`expires_at`, con Flow ya corregido por `effectivePeriodEndIso`): antes la
 * tabla solo decía «0d» y la ficha formateaba en la zona del servidor (UTC), así que un coach Flow
 * que se cobra el 02/10 a las 00:00 aparecía venciendo el 30/09.
 *
 * - Fecha/hora con zona fija (`formatSantiago*`) ⇒ mismo texto en SSR y cliente.
 * - El «en 26 h» depende del reloj ⇒ se calcula recién tras montar (patrón de `AdminRelativeTime`,
 *   Sentry EVA-NEXTJS-18).
 * - El color sale de `days` (calculado en el servidor) ⇒ también determinista.
 */

/** Solo el «en 26 h», calculado tras montar. */
export function AdminExpiryCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
    const [nowMs, setNowMs] = useState<number | null>(null)
    useEffect(() => {
        setNowMs(Date.now())
    }, [])
    if (nowMs === null) return <span className={className} aria-hidden>…</span>
    return <span className={className}>{expiryCountdownLabel(Date.parse(expiresAt), nowMs)}</span>
}

const EXPIRY_TITLE = 'Hora de Chile. Fin de lo pagado = momento del próximo cobro.'

export function AdminExpiry({
    expiresAt,
    days,
    layout = 'stack',
    withYear = false,
}: {
    expiresAt: string | null | undefined
    days: number | null | undefined
    /** stack = fecha arriba y cuenta regresiva abajo (tabla); inline = una sola línea. */
    layout?: 'stack' | 'inline'
    withYear?: boolean
}) {
    if (!expiresAt) return <span className="text-muted">—</span>
    const stamp = formatExpiryStamp(expiresAt, withYear)
    if (!stamp) return <span className="text-muted">—</span>
    const tone = expiryToneClass(days)

    if (layout === 'inline') {
        return (
            <span className="inline-flex items-baseline gap-1.5" title={EXPIRY_TITLE}>
                <span className={`font-mono text-xs tabular-nums ${tone}`}>{stamp}</span>
                <AdminExpiryCountdown expiresAt={expiresAt} className="text-[10px] text-muted" />
            </span>
        )
    }

    return (
        <span className="flex flex-col leading-tight" title={EXPIRY_TITLE}>
            <span className={`whitespace-nowrap font-mono text-xs tabular-nums ${tone}`}>{stamp}</span>
            <AdminExpiryCountdown expiresAt={expiresAt} className="whitespace-nowrap text-[10px] text-muted" />
        </span>
    )
}
