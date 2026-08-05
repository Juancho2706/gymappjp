import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Control de acceso al panel CEO (F4 08-05).
 *
 * Dos capas que se UNEN (nunca se restan):
 * 1. `ADMIN_EMAILS` (env) — bootstrap y fallback. Sin DB de por medio, imposible de lockear
 *    por un hiccup de red.
 * 2. `platform_admins` (DB) — allowlist persistente y auditable (altas con created_by,
 *    bajas con revoked_at; nunca DELETE). Cacheada en memoria 60s para no pagar un
 *    round-trip por request en el proxy.
 *
 * Si la lectura de DB falla se degrada a la env sola (fail-open hacia la capa estatica,
 * jamas lockout del CEO por una caida de Postgres).
 */

export function getAdminEmails(): string[] {
    const raw = process.env.ADMIN_EMAILS || ''
    return raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
}

/** Capa 1 sola (env, sincrona). Usar `isAllowedAdminEmail` salvo que el contexto exija sync. */
export function isAdminEmail(email: string | undefined | null): boolean {
    if (!email) return false
    return getAdminEmails().includes(email.toLowerCase().trim())
}

const DB_CACHE_TTL_MS = 60_000
let dbEmailsCache: { emails: Set<string>; fetchedAt: number } | null = null

async function getDbAdminEmails(): Promise<Set<string>> {
    const now = Date.now()
    if (dbEmailsCache && now - dbEmailsCache.fetchedAt < DB_CACHE_TTL_MS) {
        return dbEmailsCache.emails
    }
    try {
        const admin = createServiceRoleClient()
        // TODO: regenerar database.types.ts (la tabla platform_admins es de la migracion
        // 20260805230737 y el archivo generado aun no la conoce) — mismo patron (as any)
        // que los RPC de plataforma en admin.queries.ts.
        const { data, error } = await (admin.from as any)('platform_admins')
            .select('email')
            .is('revoked_at', null) as { data: { email: string }[] | null; error: unknown }
        if (error) throw error
        const emails = new Set((data ?? []).map((r) => String(r.email).toLowerCase()))
        dbEmailsCache = { emails, fetchedAt: now }
        return emails
    } catch (err) {
        console.error('[admin-gate] fallo leyendo platform_admins — degradando a ADMIN_EMAILS env', err)
        // Cachear el vacio tambien: sin esto una DB caida = un round-trip fallido por request.
        dbEmailsCache = { emails: new Set(), fetchedAt: now }
        return dbEmailsCache.emails
    }
}

/** Gate completo: union(env, platform_admins vivas). Async por la capa DB (cacheada 60s). */
export async function isAllowedAdminEmail(email: string | undefined | null): Promise<boolean> {
    if (!email) return false
    const normalized = email.toLowerCase().trim()
    if (getAdminEmails().includes(normalized)) return true
    const dbEmails = await getDbAdminEmails()
    return dbEmails.has(normalized)
}

/**
 * Enforcement de MFA del panel: ON salvo `ADMIN_MFA_ENFORCED=false` (kill-switch ops).
 * Recovery si el CEO pierde el telefono: flip de la env o borrar el factor TOTP desde el
 * dashboard de Supabase (Auth → Users → Factors).
 */
export function isAdminMfaEnforced(): boolean {
    return process.env.ADMIN_MFA_ENFORCED !== 'false'
}
