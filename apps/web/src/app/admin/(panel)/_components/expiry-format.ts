import { formatSantiagoDdMmHhMm, formatSantiagoDdMmYy } from '@/lib/date-utils'

/**
 * Formato PURO del «Vence» del panel admin. Vive fuera de `AdminExpiry.tsx` (`'use client'`) porque
 * la ficha `/admin/coaches/[id]` es Server Component: una función importada de un módulo cliente
 * llega al servidor como referencia y no se puede llamar.
 */

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** «en 26 h» / «en 5 d» / «venció hace 3 h». Bajo 48 h va en horas: cerca del cobro importa la hora. */
export function expiryCountdownLabel(expiresAtMs: number, nowMs: number): string {
    const diff = expiresAtMs - nowMs
    const abs = Math.abs(diff)
    const hours = Math.floor(abs / HOUR_MS)
    const days = Math.floor(abs / DAY_MS)
    const amount = abs < 2 * DAY_MS ? (hours < 1 ? '<1 h' : `${hours} h`) : `${days} d`
    return diff >= 0 ? `en ${amount}` : `venció hace ${amount}`
}

/** `02/10 00:00` (o `02/10/26 00:00` con año), hora de Chile. Instante inválido ⇒ cadena vacía. */
export function formatExpiryStamp(iso: string, withYear = false): string {
    const ddmmHhmm = formatSantiagoDdMmHhMm(iso)
    if (!ddmmHhmm || !withYear) return ddmmHhmm
    const time = ddmmHhmm.split(' ')[1] ?? ''
    return `${formatSantiagoDdMmYy(iso)} ${time}`
}

/** Color por días restantes: vencido/sin fecha apagado, < 7 rojo, < 14 ámbar. */
export function expiryToneClass(days: number | null | undefined): string {
    if (days === null || days === undefined || days < 0) return 'text-muted'
    if (days < 7) return 'text-[var(--danger-500)]'
    if (days < 14) return 'text-[var(--warning-500)]'
    return 'text-body'
}
