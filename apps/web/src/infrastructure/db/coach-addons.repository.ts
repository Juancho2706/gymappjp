import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ModuleKey } from '@/services/entitlements.service'
import type {
    AddonSource,
    AddonStatus,
    CoachAddon,
} from '@/domain/billing/types'

type DB = SupabaseClient<Database>
type CoachAddonRow = Database['public']['Tables']['coach_addons']['Row']

/**
 * Repository de `coach_addons` (plan 05 F2). Acceso a datos PURO: el cálculo de montos,
 * la máquina de estados y el gating viven en `services/billing/addons.service.ts`.
 *
 * ⚠️ TODA escritura corre con SERVICE-ROLE (la migración 20260612150000 revoca
 * INSERT/UPDATE/DELETE al rol `authenticated`; la única policy es SELECT propio).
 * Pasar siempre un client creado con `createServiceRoleClient()` a los métodos de
 * escritura — un client user-scoped fallará por RLS. El SELECT propio sí funciona con
 * el client user-scoped del coach (lo usa `/coach/subscription`).
 *
 * El trigger `trg_coach_addons_sync` (D1) recomputa `coaches.enabled_modules` en la
 * misma transacción de cada INSERT/UPDATE/DELETE — el repository nunca toca ese jsonb.
 */

const COACH_ADDON_COLUMNS =
    'id, coach_id, module_key, status, source, price_clp, terms_version, terms_accepted_at, activated_at, first_charged_at, cancel_requested_at, expires_at, cancelled_at, created_at, updated_at'

/** Mapeo snake_case (DB) → CoachAddon del dominio (el dominio nunca ve columnas). */
export function coachAddonFromRow(row: CoachAddonRow): CoachAddon {
    return {
        id: row.id,
        coachId: row.coach_id,
        moduleKey: row.module_key as ModuleKey,
        status: row.status as AddonStatus,
        source: row.source as AddonSource,
        priceClpMensual: row.price_clp,
        termsVersion: row.terms_version,
        termsAcceptedAt: row.terms_accepted_at,
        activatedAt: row.activated_at,
        firstChargedAt: row.first_charged_at,
        cancelRequestedAt: row.cancel_requested_at,
        expiresAt: row.expires_at,
        cancelledAt: row.cancelled_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

/** Filas VIVAS (active | cancel_pending) del coach — las que prenden el módulo. */
export async function listLive(db: DB, coachId: string): Promise<CoachAddon[]> {
    const { data, error } = await db
        .from('coach_addons')
        .select(COACH_ADDON_COLUMNS)
        .eq('coach_id', coachId)
        .in('status', ['active', 'cancel_pending'])
        .order('created_at', { ascending: true })
    if (error) throw new Error(`listLive coach_addons: ${error.message}`)
    return (data ?? []).map((r) => coachAddonFromRow(r as CoachAddonRow))
}

/** TODAS las filas del coach (incluye `cancelled` — historial). */
export async function listAll(db: DB, coachId: string): Promise<CoachAddon[]> {
    const { data, error } = await db
        .from('coach_addons')
        .select(COACH_ADDON_COLUMNS)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
    if (error) throw new Error(`listAll coach_addons: ${error.message}`)
    return (data ?? []).map((r) => coachAddonFromRow(r as CoachAddonRow))
}

export type InsertAddonInput = {
    coachId: string
    moduleKey: ModuleKey
    source: AddonSource
    /** Precio MENSUAL de lista congelado. 0 en `admin_grant`. */
    priceClpMensual: number
    termsVersion: string
    /** Set en el alta trim/anual (one-shot ya cobrado) y en signup confirmado por webhook. */
    firstChargedAt?: string | null
    /** ISO de aceptación (default = now() en DB). */
    termsAcceptedAt?: string | null
}

/**
 * Inserta una fila viva (status='active', service-role). El índice único parcial
 * `coach_addons_one_live_per_module` rechaza una segunda fila viva del mismo módulo y
 * source — el service mapea ese error a "módulo ya activo". El trigger D1 prende el módulo.
 */
export async function insertAddon(db: DB, input: InsertAddonInput): Promise<CoachAddon> {
    const insertRow: Database['public']['Tables']['coach_addons']['Insert'] = {
        coach_id: input.coachId,
        module_key: input.moduleKey,
        status: 'active',
        source: input.source,
        price_clp: input.priceClpMensual,
        terms_version: input.termsVersion,
        first_charged_at: input.firstChargedAt ?? null,
        ...(input.termsAcceptedAt ? { terms_accepted_at: input.termsAcceptedAt } : {}),
    }
    const { data, error } = await db
        .from('coach_addons')
        .insert(insertRow)
        .select(COACH_ADDON_COLUMNS)
        .single()
    if (error) throw new Error(error.message)
    return coachAddonFromRow(data as CoachAddonRow)
}

/**
 * Set-once de `first_charged_at` (idempotente: WHERE first_charged_at IS NULL), SOLO
 * filas `source='self_service'` — los grants jamás "se cobran". Lo usa el webhook al ver
 * el primer cobro recurrente del coach (regla 2/3, ciclo mensual). Devuelve las filas
 * efectivamente marcadas (las que estaban sin cobrar).
 */
export async function markFirstCharged(
    db: DB,
    coachId: string,
    chargedAt: string
): Promise<CoachAddon[]> {
    // P0-6: set-once por `first_charged_at IS NULL` (idempotente). Antes había un guard
    // `.lt('activated_at', chargedAt)` que, en el alta combo, EXCLUÍA un add-on recién activado cuyo
    // `activated_at` era ≥ el `date_approved` del primer cobro → first_charged_at quedaba null → más
    // tarde una baja regla-3 sobre-cobraba un ciclo. Quitado: el set-once ya garantiza idempotencia.
    const { data, error } = await db
        .from('coach_addons')
        .update({ first_charged_at: chargedAt })
        .eq('coach_id', coachId)
        .eq('source', 'self_service')
        .is('first_charged_at', null)
        .in('status', ['active', 'cancel_pending'])
        .select(COACH_ADDON_COLUMNS)
    if (error) throw new Error(`markFirstCharged: ${error.message}`)
    return (data ?? []).map((r) => coachAddonFromRow(r as CoachAddonRow))
}

/**
 * Marca una fila viva como `cancel_pending` (baja solicitada). `expiresAt` se setea ya
 * en la regla 4 (PUT inmediato) y queda `null` en la regla 3 (compromiso mínimo mensual:
 * el `expires_at` se fija recién al primer cobro). Devuelve la fila actualizada o null.
 */
export async function requestCancel(
    db: DB,
    addonId: string,
    values: { cancelRequestedAt: string; expiresAt?: string | null }
): Promise<CoachAddon | null> {
    const update: Database['public']['Tables']['coach_addons']['Update'] = {
        status: 'cancel_pending',
        cancel_requested_at: values.cancelRequestedAt,
        ...(values.expiresAt !== undefined ? { expires_at: values.expiresAt } : {}),
    }
    const { data, error } = await db
        .from('coach_addons')
        .update(update)
        .eq('id', addonId)
        .in('status', ['active', 'cancel_pending'])
        .select(COACH_ADDON_COLUMNS)
        .maybeSingle()
    if (error) throw new Error(`requestCancel: ${error.message}`)
    return data ? coachAddonFromRow(data as CoachAddonRow) : null
}

/**
 * Aplica la expiración de una fila `cancel_pending` cuyo `expires_at` ya se alcanzó:
 * pasa a `cancelled` (terminal). El trigger D1 apaga el módulo. Idempotente (solo afecta
 * filas aún `cancel_pending`). Lo usa la pasada diaria de reconcile.
 */
export async function applyExpiry(
    db: DB,
    addonId: string,
    cancelledAt: string
): Promise<CoachAddon | null> {
    const { data, error } = await db
        .from('coach_addons')
        .update({ status: 'cancelled', cancelled_at: cancelledAt })
        .eq('id', addonId)
        .eq('status', 'cancel_pending')
        .select(COACH_ADDON_COLUMNS)
        .maybeSingle()
    if (error) throw new Error(`applyExpiry: ${error.message}`)
    return data ? coachAddonFromRow(data as CoachAddonRow) : null
}

/**
 * Override del CEO (D2 / plan 05 F6.1): cancela DURO la fila viva `admin_grant` de un módulo
 * (cortesía retirada). El grant NO tiene ciclo que esperar (price 0, sin preapproval): pasa
 * directo a `cancelled`. El trigger D1 recomputa `enabled_modules` (si quedaba una fila paga
 * del mismo módulo, el módulo sigue ON por esa fila — el grant y el pago coexisten). Idempotente
 * (solo afecta la fila viva del grant). Devuelve la fila cancelada o null si no había grant vivo.
 */
export async function revokeAdminGrant(
    db: DB,
    coachId: string,
    moduleKey: ModuleKey,
    cancelledAt: string
): Promise<CoachAddon | null> {
    const { data, error } = await db
        .from('coach_addons')
        .update({ status: 'cancelled', cancelled_at: cancelledAt })
        .eq('coach_id', coachId)
        .eq('module_key', moduleKey)
        .eq('source', 'admin_grant')
        .in('status', ['active', 'cancel_pending'])
        .select(COACH_ADDON_COLUMNS)
        .maybeSingle()
    if (error) throw new Error(`revokeAdminGrant: ${error.message}`)
    return data ? coachAddonFromRow(data as CoachAddonRow) : null
}

/**
 * Cancela DURO todas las filas vivas del coach (cuando el preapproval expira de verdad —
 * rama `expire` del webhook). Pasa active|cancel_pending → cancelled; el trigger D1 apaga
 * los módulos. Devuelve cuántas filas se afectaron.
 */
export async function cancelAllForCoach(
    db: DB,
    coachId: string,
    cancelledAt: string
): Promise<number> {
    const { data, error } = await db
        .from('coach_addons')
        .update({ status: 'cancelled', cancelled_at: cancelledAt })
        .eq('coach_id', coachId)
        .in('status', ['active', 'cancel_pending'])
        .select('id')
    if (error) throw new Error(`cancelAllForCoach: ${error.message}`)
    return (data ?? []).length
}
