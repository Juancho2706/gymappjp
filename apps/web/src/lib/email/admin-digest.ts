import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TablesInsert } from '@/lib/database.types'

/**
 * DEDUPE DE DIGESTS A ADMIN_EMAILS (decisión D4 del owner, 2026-09-05).
 *
 * Los crons `mp-reconcile` y `paid-expiry` mandaban su resumen diario a ADMIN_EMAILS SIN dedupe: la
 * misma divergencia («1 divergencia(s) + 0 alerta(s)», el coach ljfitness activo en DB / pending en
 * MP) llegó idéntica del 29-08 al 05-09. Ocho correos iguales entrenan a ignorarlos, que es
 * exactamente lo contrario de una alerta. Regla nueva: si el CONTENIDO del digest es idéntico al del
 * último envío registrado, NO se manda y se deja la traza de que se suprimió.
 *
 * Para FORZAR un reenvío basta con que el contenido cambie (aparece o se arregla una divergencia,
 * cambia el detalle de una alerta, cambia el conteo de vencidas): el hash cambia y el correo sale. No
 * hay ventana de tiempo ni "reaviso cada N días" a propósito — el disparador es el CAMBIO de estado,
 * no el paso del tiempo; lo que no cambia sigue visible en admin_audit_logs y en el panel.
 *
 * CERO DDL: el ledger es `admin_audit_logs`, tabla que estos mismos crons ya escriben (mismo truco
 * que `sales-emails.service`). Una fila por corrida con divergencias, con `payload.digest_hash`.
 */

type Db = SupabaseClient<Database>

/** Acción del ledger para el digest del cron `mp-reconcile`. */
export const MP_RECONCILE_DIGEST_ACTION = 'cron.mp_reconcile_digest'

/** Acción del ledger para el digest del cron `paid-expiry`. */
export const PAID_EXPIRY_DIGEST_ACTION = 'cron.paid_expiry_digest'

/**
 * Forma canónica de un valor: claves de objeto ordenadas alfabéticamente y listas ordenadas por la
 * representación canónica de cada elemento. Sin esto el hash sería mentiroso en las dos direcciones:
 * el orden de `Object.keys` no está garantizado entre construcciones y las queries de Supabase no
 * garantizan orden de filas, así que dos corridas con EL MISMO contenido podrían hashear distinto y
 * el correo se mandaría igual (que es el bug que estamos matando).
 */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value
            .map(canonicalize)
            .map((item) => ({ item, key: JSON.stringify(item) }))
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
            .map((entry) => entry.item)
    }
    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(source).sort()) {
            out[key] = canonicalize(source[key])
        }
        return out
    }
    return value
}

/**
 * Huella sha256 (hex) del CONTENIDO del digest. Pura y determinista: mismas partes ⇒ mismo hash, sin
 * importar el orden en que el cron las haya acumulado. Solo deben entrar los datos que el humano lee
 * en el correo; nunca timestamps ni contadores de corrida (harían que todo digest sea "distinto").
 */
export function computeDigestHash(parts: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(parts))).digest('hex')
}

/**
 * Hash del último digest registrado para esa acción, o null si no hay ninguno.
 *
 * FAIL-OPEN deliberado: si `admin_audit_logs` no se puede leer devolvemos null ⇒ el hash nunca
 * coincide ⇒ el correo SALE. Mejor un correo de más que perder una alerta de cobro por un problema
 * de la tabla de auditoría.
 */
export async function readLastDigestHash(admin: Db, action: string): Promise<string | null> {
    try {
        const { data, error } = await admin
            .from('admin_audit_logs')
            .select('payload')
            .eq('action', action)
            .order('created_at', { ascending: false })
            .limit(1)
        if (error) {
            console.error(`[admin-digest] lectura del ledger falló para ${action}:`, error.message)
            return null
        }
        const payload = (data ?? [])[0]?.payload as { digest_hash?: unknown } | null
        return typeof payload?.digest_hash === 'string' ? payload.digest_hash : null
    } catch (err) {
        console.error(`[admin-digest] lectura del ledger lanzó para ${action}:`, err)
        return null
    }
}

/**
 * Deja la traza de la decisión: qué contenido se evaluó (`digest_hash`) y si terminó saliendo por
 * correo (`sent: false` = suprimido por idéntico). Copia la forma de las filas `cron.*` vecinas
 * (`cron.cap_nudge_ran`, `cron.paid_expiry_ran`): admin_email 'cron', target sobre `coaches`.
 *
 * NUNCA lanza: la traza es evidencia, no el trabajo. Si el insert falla, el correo ya salió (o ya se
 * decidió no mandarlo) y la corrida es un éxito con la traza perdida — a lo sumo mañana se manda un
 * duplicado, que es el lado seguro del error.
 */
export async function recordDigest(
    admin: Db,
    action: string,
    entry: { digest_hash: string; sent: boolean; summary: Record<string, Json> }
): Promise<void> {
    try {
        const row: TablesInsert<'admin_audit_logs'> = {
            admin_email: 'cron',
            action,
            target_table: 'coaches',
            target_id: null,
            payload: {
                digest_hash: entry.digest_hash,
                sent: entry.sent,
                summary: entry.summary,
            },
        }
        const { error } = await admin.from('admin_audit_logs').insert(row)
        if (error) {
            console.error(`[admin-digest] escritura del ledger falló para ${action}:`, error.message)
        }
    } catch (err) {
        console.error(`[admin-digest] escritura del ledger lanzó para ${action}:`, err)
    }
}
