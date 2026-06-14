import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * services/billing/plan-change-lock — candado in-flight de UPGRADE de tier (audit P0-4).
 *
 * Sin migración: reutiliza `subscription_events` como marcador efímero. Un upgrade es un
 * one-shot prorrateado que se confirma de forma asíncrona (confirm-upgrade o webhook). Entre
 * "creé el one-shot" y "activé el tier" hay una ventana donde un segundo upgrade, un alta de
 * add-on o un cambio de ciclo recomputarían el compuesto sobre el tier viejo y plegarían el
 * pago pendiente dos veces. Este candado cierra esa ventana.
 *
 * Clave por coach: `tier_upgrade_pending:${coachId}` en `provider_event_id` (único). El marcador
 * vive a lo sumo `TTL_MINUTES` (auto-recupera si el checkout se abandona: la query filtra por
 * `created_at > now()-interval`). El borrado explícito (`clearUpgradeInFlight`) lo limpia al
 * activar el tier o al fallar el flujo.
 *
 * ⚠️ `db` SIEMPRE service-role: la migración 20260612150000 (y hermanas de billing) revocan la
 * escritura de `subscription_events` a `authenticated`. Un client user-scoped fallará por RLS.
 */

/** Minutos de vida del marcador antes de auto-recuperar (checkout abandonado). */
export const TTL_MINUTES = 30

/** `provider_event_id` del marcador in-flight del coach (único → un solo upgrade a la vez). */
export function upgradeInFlightKey(coachId: string): string {
    return `tier_upgrade_pending:${coachId}`
}

/**
 * ¿Este error de supabase-js/PostgREST es una violación del UNIQUE de `provider_event_id`?
 * PostgREST/PostgREST surface el SQLSTATE `23505` en `.code`. Como defensa extra (proxies/
 * wrappers que no propaguen `.code`) también detectamos por el nombre del constraint en el
 * mensaje (`subscription_events_provider_event_id_key`).
 */
function isUniqueViolation(error: { code?: string | null; message?: string | null } | null): boolean {
    if (!error) return false
    if (error.code === '23505') return true
    const msg = error.message ?? ''
    return /subscription_events_provider_event_id_key/.test(msg) || /duplicate key value/i.test(msg)
}

/** Fila marcador (misma forma que setUpgradeInFlight). */
function markerRow(coachId: string): Database['public']['Tables']['subscription_events']['Insert'] {
    return {
        coach_id: coachId,
        provider: 'mercadopago',
        provider_event_id: upgradeInFlightKey(coachId),
        provider_status: 'tier_upgrade_pending',
        payload: {},
    }
}

/**
 * INSERT del marcador. `true` = insertado (ganó el UNIQUE → dueño del candado); `false` = colisión
 * 23505 (otra request ya tiene la ranura). Cualquier otro error → throw (fail-closed). El UNIQUE de
 * `provider_event_id` hace que SOLO una de N inserciones concurrentes gane: ése es el reclamo atómico.
 */
async function tryInsertMarker(db: DB, coachId: string): Promise<boolean> {
    const { error } = await db.from('subscription_events').insert(markerRow(coachId))
    if (!error) return true
    if (isUniqueViolation(error)) return false
    throw new Error(`claimUpgradeInFlight (insert): ${error.message}`)
}

/**
 * ¿Hay un upgrade en vuelo para este coach? `true` si existe una fila del marcador con
 * `created_at` dentro de la ventana de `TTL_MINUTES` (filas más viejas = checkout abandonado,
 * se ignoran y el llamador puede arrancar uno nuevo).
 *
 * `db` debe ser service-role.
 */
export async function isUpgradeInFlight(db: DB, coachId: string): Promise<boolean> {
    const key = upgradeInFlightKey(coachId)
    const sinceIso = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString()
    const { data, error } = await db
        .from('subscription_events')
        .select('created_at')
        .eq('provider_event_id', key)
        .gt('created_at', sinceIso)
        .maybeSingle()
    if (error) throw new Error(`isUpgradeInFlight: ${error.message}`)
    return data !== null
}

/**
 * @deprecated NO usar para reclamar el candado en un flujo concurrente — usa `claimUpgradeInFlight`.
 * Este helper hace DELETE→INSERT incondicional (no atómico): dos requests simultáneas del mismo coach
 * pueden ambas "marcar" y ambas seguir (el mismo TOCTOU de stale-takeover que cerró el CAS de
 * `claimUpgradeInFlight`). Sin llamadores en producción (create-preference migró a claim). Se conserva
 * solo por compatibilidad de tests; cualquier reclamo nuevo DEBE ir por `claimUpgradeInFlight`.
 *
 * Marca el upgrade como en vuelo. Borra primero la fila previa del marcador y luego inserta una
 * fresca para que `created_at` quede al momento actual (renueva el TTL aunque hubiera un marcador
 * viejo abandonado). `provider_event_id` es único: el DELETE→INSERT evita la colisión del upsert.
 *
 * `db` debe ser service-role.
 */
export async function setUpgradeInFlight(db: DB, coachId: string): Promise<void> {
    const key = upgradeInFlightKey(coachId)
    const { error: delError } = await db
        .from('subscription_events')
        .delete()
        .eq('provider_event_id', key)
    if (delError) throw new Error(`setUpgradeInFlight (delete): ${delError.message}`)
    const insertRow: Database['public']['Tables']['subscription_events']['Insert'] = {
        coach_id: coachId,
        provider: 'mercadopago',
        provider_event_id: key,
        provider_status: 'tier_upgrade_pending',
        payload: {},
    }
    const { error: insError } = await db.from('subscription_events').insert(insertRow)
    if (insError) throw new Error(`setUpgradeInFlight (insert): ${insError.message}`)
}

/**
 * Reclama ATÓMICAMENTE el candado in-flight (cierre del TOCTOU del check→set de setUpgradeInFlight).
 * Apoya la atomicidad en el UNIQUE `subscription_events_provider_event_id_key` (baseline
 * 00000000000001_baseline.sql): el primer INSERT que gane el constraint es el único dueño del
 * candado. Dos upgrades verdaderamente simultáneos del MISMO coach ya no pueden ambos crear un
 * one-shot — solo uno reclama, el otro recibe `false`.
 *
 * - INSERT fresco OK → `true` (reclamado).
 * - UNIQUE VIOLATION (23505) → ya existe un marcador: se lee su `created_at`.
 *     · FRESCO (`created_at > now()-TTL`) → `false` (alguien sostiene un candado vivo).
 *     · DESAPARECIDO (limpiado en la carrera) → reintento de INSERT atómico: OK `true` / colisión `false`.
 *     · RANCIO (checkout abandonado) → TOMA DE CONTROL con COMPARE-AND-SWAP: se borra SOLO esa fila
 *       rancia exacta (match por `created_at`); si el DELETE afecta 0 filas, otra request ya la tomó
 *       → `false`. Si la tomamos, INSERT final atómico: OK `true` / colisión (un racer metió fila
 *       fresca primero) `false`.
 * - Cualquier otro error → throw (fail-closed: el route lo surfacea como 500).
 *
 * El CAS por `created_at` cierra el TOCTOU del stale-takeover: el DELETE incondicional + INSERT
 * anterior dejaba que DOS requests que veían el mismo marcador rancio ganaran ambas (la 2ª borraba
 * la fila fresca recién ganada por la 1ª) → doble one-shot. Ahora solo la request que borra la fila
 * rancia EXACTA puede reinsertar; las demás ven 0 filas borradas y ceden.
 *
 * `db` debe ser service-role (la migración 20260612150000 revoca el write de subscription_events a
 * `authenticated`).
 */
export async function claimUpgradeInFlight(db: DB, coachId: string): Promise<boolean> {
    const key = upgradeInFlightKey(coachId)

    // (1) Intento de reclamo: INSERT fresco. Si gana el UNIQUE, el candado es nuestro.
    if (await tryInsertMarker(db, coachId)) return true

    // (2) Ya existe un marcador. ¿Está vivo (dentro del TTL) o es un checkout abandonado?
    const sinceIso = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString()
    const { data: existing, error: selError } = await db
        .from('subscription_events')
        .select('created_at')
        .eq('provider_event_id', key)
        .maybeSingle()
    if (selError) throw new Error(`claimUpgradeInFlight (select): ${selError.message}`)

    // La fila desapareció entre el conflicto y el SELECT (otra request la limpió): la ranura está
    // libre y el propio INSERT es el reclamo atómico. Reintentar UNA vez.
    if (existing == null) return await tryInsertMarker(db, coachId)

    const isFresh =
        existing.created_at != null &&
        new Date(existing.created_at).getTime() > new Date(sinceIso).getTime()
    if (isFresh) return false // candado vivo en manos de otro

    // (3) Marcador RANCIO → toma de control con COMPARE-AND-SWAP: borrar SOLO esta fila rancia exacta
    //     (match por created_at). Una request concurrente que ya la borró ve 0 filas → pierde la carrera.
    const { data: deletedRows, error: delError } = await db
        .from('subscription_events')
        .delete()
        .eq('provider_event_id', key)
        .eq('created_at', existing.created_at)
        .select('provider_event_id')
    if (delError) throw new Error(`claimUpgradeInFlight (cas-delete): ${delError.message}`)
    if (!deletedRows || deletedRows.length === 0) return false // perdimos la carrera del stale-takeover

    // Ganamos el DELETE. INSERT final; si un racer metió una fila fresca, el UNIQUE lo rechaza → cedemos.
    return await tryInsertMarker(db, coachId)
}

/**
 * Limpia el marcador in-flight del coach (upgrade activado o flujo abortado). Idempotente: si
 * no hay marcador, no-op. Lo llaman confirm-upgrade y la rama tierUpgrade del webhook al activar.
 *
 * `db` debe ser service-role.
 */
export async function clearUpgradeInFlight(db: DB, coachId: string): Promise<void> {
    const key = upgradeInFlightKey(coachId)
    const { error } = await db
        .from('subscription_events')
        .delete()
        .eq('provider_event_id', key)
    if (error) throw new Error(`clearUpgradeInFlight: ${error.message}`)
}
