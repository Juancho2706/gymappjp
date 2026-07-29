import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * P2: serve check-in (progress) photos via SIGNED URLs from the (eventually private) `checkins`
 * bucket. Single chokepoint so the ~50 display components keep receiving ready-to-render URLs.
 *
 * Dual-read: handles BOTH legacy stored values (full public URLs) AND new stored values (paths),
 * so nothing breaks while we migrate writers + backfill rows. createSignedUrls works on public
 * buckets too, so this is safe to ship BEFORE flipping the bucket private.
 */

const BUCKET = 'checkins'
const SIGNED_TTL_SECONDS = 600
// Reuse signatures within a window so re-renders don't regenerate (CDN / egress friendly).
const CACHE_TTL_MS = (SIGNED_TTL_SECONDS - 60) * 1000
const cache = new Map<string, { url: string; expiresAt: number }>()

type DB = SupabaseClient<Database>

/** The check_ins columns that may hold a photo reference. */
const PHOTO_FIELDS = ['front_photo_url', 'back_photo_url', 'side_photo_url'] as const

export type CheckinPhotoField = (typeof PHOTO_FIELDS)[number]

/**
 * Acota QUÉ se firma. Firmar los 3 campos de todas las filas es carísimo en alumnos con
 * historial largo (N filas x 3 signatures) cuando la vista solo pinta unas pocas.
 * Sin opciones => comportamiento historico (los 3 campos de todas las filas).
 */
export type ResolveCheckinPhotoUrlsOptions = {
    /**
     * Cantidad de filas —contando SOLO las que tienen alguna foto, en el orden recibido—
     * que reciben los 3 campos firmados (las que la UI muestra con fallback
     * `front || side || back`). El resto recibe unicamente `tailFields`.
     */
    fullPhotoRows?: number
    /** Campos firmados en las filas fuera de `fullPhotoRows`. Default: los 3. */
    tailFields?: readonly CheckinPhotoField[]
}

/**
 * Normalize a stored value (legacy full public/sign URL OR a storage path) to a bucket path.
 * Returns null for empty or unrecognized external URLs (so the UI shows nothing, not a broken img).
 */
export function toCheckinPath(stored: string | null | undefined): string | null {
    if (!stored) return null
    const s = String(stored).trim()
    if (!s) return null
    const m = s.match(/\/object\/(?:public|sign|authenticated)\/checkins\/([^?]+)/)
    if (m) return decodeURIComponent(m[1])
    if (/^https?:\/\//i.test(s)) return null // unknown external URL — cannot sign
    return s.replace(/^\/+/, '')
}

async function signPaths(admin: DB, paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const now = Date.now()
    const need: string[] = []
    for (const p of paths) {
        const c = cache.get(p)
        if (c && c.expiresAt > now) out.set(p, c.url)
        else need.push(p)
    }
    if (need.length) {
        const { data } = await admin.storage.from(BUCKET).createSignedUrls(need, SIGNED_TTL_SECONDS)
        for (const item of data ?? []) {
            if (item?.signedUrl && item.path) {
                out.set(item.path, item.signedUrl)
                cache.set(item.path, { url: item.signedUrl, expiresAt: now + CACHE_TTL_MS })
            }
        }
    }
    return out
}

/**
 * Replace the check-in photo fields of each row (paths OR legacy URLs) with ready-to-render
 * SIGNED URLs. Returns a shallow copy; rows without photos are returned untouched.
 * `admin` must be a service-role client (can sign any path; coaches have no storage SELECT policy).
 * `options` acota qué campos se firman por fila (ver `ResolveCheckinPhotoUrlsOptions`); los
 * campos NO firmados quedan en `null`, igual que hoy quedan los paths irreconocibles.
 */
export async function resolveCheckinPhotoUrls<T extends Record<string, unknown>>(
    admin: DB,
    rows: T[] | null | undefined,
    options?: ResolveCheckinPhotoUrlsOptions,
): Promise<T[]> {
    const list = rows ?? []
    const { fullPhotoRows, tailFields = PHOTO_FIELDS } = options ?? {}

    // Campos a firmar por fila (índice alineado con `list`).
    const perRowFields: CheckinPhotoField[][] = []
    let rowsWithPhoto = 0
    for (const r of list) {
        const hasAnyPhoto = PHOTO_FIELDS.some((f) => toCheckinPath(r?.[f] as string | null | undefined))
        const full = fullPhotoRows === undefined || (hasAnyPhoto && rowsWithPhoto < fullPhotoRows)
        if (hasAnyPhoto) rowsWithPhoto += 1
        perRowFields.push(full ? [...PHOTO_FIELDS] : [...tailFields])
    }

    const paths = new Set<string>()
    list.forEach((r, i) => {
        for (const f of perRowFields[i]!) {
            const p = toCheckinPath(r?.[f] as string | null | undefined)
            if (p) paths.add(p)
        }
    })
    if (paths.size === 0) return list
    const signed = await signPaths(admin, [...paths])
    return list.map((r, i) => {
        const allowed = perRowFields[i]!
        const copy = { ...r } as Record<string, unknown>
        for (const f of PHOTO_FIELDS) {
            const p = allowed.includes(f) ? toCheckinPath(r?.[f] as string | null | undefined) : null
            copy[f] = p ? signed.get(p) ?? null : null
        }
        return copy as T
    })
}

/** Single-value convenience (e.g. one latest check-in photo). */
export async function resolveCheckinPhotoUrl(admin: DB, storedValue: string | null | undefined): Promise<string | null> {
    const p = toCheckinPath(storedValue)
    if (!p) return null
    const signed = await signPaths(admin, [p])
    return signed.get(p) ?? null
}
