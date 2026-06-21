import { randomInt } from 'node:crypto'

/**
 * services/billing/coupons.normalize — helpers PUROS de normalización de códigos de cupón (F3).
 *
 * El código se guarda YA normalizado (UPPER+trim, sin espacios/guiones) en `coupon_codes.code_normalized`
 * → la unicidad case-insensitive sale directa del índice (sin lower() wrap, decisión de perf de F1).
 * El email se normaliza (anti +alias / dots de gmail) para la atomicidad de `first_time_only`.
 */

/** Normaliza un código canjeable: UPPER + trim + elimina espacios y guiones internos. Idempotente. */
export function normalizeCouponCode(raw: string): string {
    return raw.toUpperCase().replace(/[\s-]+/g, '').trim()
}

/**
 * Normaliza un email para la clave `first_time_only` (anti-bypass): lowercase + trim. Para gmail/
 * googlemail elimina los puntos del local-part y trunca el `+alias` (gmail los ignora → son la MISMA
 * cuenta). Otros dominios solo se truncan en `+alias` (convención común) sin tocar los puntos.
 */
export function normalizeEmailForFirstTime(raw: string): string {
    const email = raw.trim().toLowerCase()
    const at = email.lastIndexOf('@')
    if (at <= 0) return email
    let local = email.slice(0, at)
    const domain = email.slice(at + 1)
    const plus = local.indexOf('+')
    if (plus >= 0) local = local.slice(0, plus)
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        local = local.replace(/\./g, '')
    }
    return `${local}@${domain}`
}

/** Alfabeto sin ambigüedad (sin 0/O/1/I/L) para los códigos autogenerados (legibilidad anti-error). */
const UNAMBIGUOUS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Genera UN candidato de código random de alta entropía (default 10 chars del alfabeto sin ambigüedad).
 * Ya normalizado (el alfabeto es UPPER). La unicidad la garantiza el llamador con retry-on-collision
 * contra `coupon_codes` (mirror de generateUniqueInviteCode). `randomInt` de node:crypto = CSPRNG.
 */
export function randomCouponCode(length = 10): string {
    let out = ''
    for (let i = 0; i < length; i++) {
        out += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)]
    }
    return out
}
