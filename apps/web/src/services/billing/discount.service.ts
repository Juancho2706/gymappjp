import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { DiscountSpec, DiscountTarget, DiscountType } from '@/lib/constants'

type DB = SupabaseClient<Database>

/**
 * services/billing/discount.service — resolución server-side del cupón vivo del coach (F2a.2b).
 *
 * El descuento NUNCA se confía del cliente ni del `external_reference`: se re-resuelve en CADA
 * call site de precio (create-preference, webhook x ramas, cron reconcile, confirm-upgrade,
 * subscription-status) desde `coaches.active_coupon_redemption_id` → `coupon_redemptions`, y se
 * pasa como 4º arg a `getCompositeAmountClp` (único chokepoint). Así checkout == webhook == cron
 * computan el MISMO neto (drift-safe) y un preapproval con cupón nunca dispara `addon_amount_drift`.
 *
 * NO importa de `app/` ni de Next. `db` service-role para la lectura del catálogo (el cliente
 * user-scoped no joinea `coupon_redemptions` con sus términos bajo RLS más allá del SELECT propio;
 * para la página usar la RPC `resolve_active_discount` — ver `resolveActiveDiscountFromRpc`).
 */

/**
 * Forma CONGELADA de `coupon_redemptions.discount_value_snapshot` (jsonb). La escribe el canje
 * (F3) y es evidencia SERNAC inmutable. Contiene todo lo necesario para reconstruir el `DiscountSpec`
 * de precio + datos de display (code/label). `floorClp` opcional = margin floor congelado (O8).
 */
export type DiscountValueSnapshot = {
    type: DiscountType
    value: number
    target: DiscountTarget
    moduleKeys?: string[]
    /** Código mostrado al canjear (evidencia + UI activeCoupon). */
    code?: string
    /** Piso de margen congelado al canje (O8); si ausente, el motor usa su default. */
    floorClp?: number
}

const DISCOUNT_TYPES = new Set<DiscountType>(['percent', 'fixed_clp'])
const DISCOUNT_TARGETS = new Set<DiscountTarget>(['base', 'module', 'total'])

/**
 * PURA: valida un `discount_value_snapshot` (jsonb desconocido) + los ciclos restantes del ledger
 * y devuelve un `DiscountSpec` de precio, o `null` si el snapshot es inválido / el descuento no
 * aplica. `appliedCyclesRemaining`: null = forever/once vigente; <= 0 = expirado (sin descuento).
 * La decisión de "una vez" / decremento por ciclo la materializa el ledger (F4), acá solo se lee.
 */
export function discountSpecFromSnapshot(
    snapshot: unknown,
    appliedCyclesRemaining: number | null
): DiscountSpec | null {
    if (!snapshot || typeof snapshot !== 'object') return null
    const s = snapshot as Record<string, unknown>
    const type = s.type
    const value = s.value
    const target = s.target
    if (typeof type !== 'string' || !DISCOUNT_TYPES.has(type as DiscountType)) return null
    if (typeof target !== 'string' || !DISCOUNT_TARGETS.has(target as DiscountTarget)) return null
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    // Expirado: ciclos agotados → sin descuento (el motor también lo cubre, pero cortamos antes).
    if (appliedCyclesRemaining !== null && appliedCyclesRemaining <= 0) return null

    const moduleKeys = Array.isArray(s.moduleKeys)
        ? s.moduleKeys.filter((k): k is string => typeof k === 'string')
        : undefined

    return {
        type: type as DiscountType,
        value,
        target: target as DiscountTarget,
        ...(moduleKeys && moduleKeys.length > 0 ? { moduleKeys } : {}),
        remainingCycles: appliedCyclesRemaining,
    }
}

/** Extrae el `floorClp` (margin floor O8) del snapshot, o `undefined` si no está congelado. */
export function discountFloorFromSnapshot(snapshot: unknown): number | undefined {
    if (!snapshot || typeof snapshot !== 'object') return undefined
    const f = (snapshot as Record<string, unknown>).floorClp
    return typeof f === 'number' && Number.isFinite(f) && f >= 0 ? Math.round(f) : undefined
}

/**
 * Resuelve el `DiscountSpec` vivo del coach vía SERVICE-ROLE (server-side, drift-safe). Dos lecturas
 * explícitas (puntero → ledger) en vez de un embed PostgREST frágil. Devuelve `null` cuando el coach
 * no tiene cupón vivo, el ledger no está `active`, o el snapshot es inválido/expirado.
 *
 * `db` DEBE ser service-role (lee el catálogo de cupones, sin RLS de SELECT para authenticated).
 */
export async function resolveActiveDiscountSpec(db: DB, coachId: string): Promise<DiscountSpec | null> {
    const { data: coach } = await db
        .from('coaches')
        .select('active_coupon_redemption_id')
        .eq('id', coachId)
        .maybeSingle()
    return resolveDiscountSpecByRedemptionId(db, coach?.active_coupon_redemption_id ?? null)
}

/**
 * Variante para call sites que YA tienen el `active_coupon_redemption_id` del coach (p.ej. el cron
 * lo incluye en su SELECT de coaches) → evita la lectura redundante de `coaches`. Devuelve `null`
 * si no hay puntero, el ledger no está `active`, o el snapshot es inválido/expirado. `db` service-role.
 */
export async function resolveDiscountSpecByRedemptionId(
    db: DB,
    redemptionId: string | null | undefined
): Promise<DiscountSpec | null> {
    if (!redemptionId) return null
    const { data: redemption } = await db
        .from('coupon_redemptions')
        .select('status, discount_value_snapshot, applied_cycles_remaining')
        .eq('id', redemptionId)
        .maybeSingle()
    if (!redemption || redemption.status !== 'active') return null
    return discountSpecFromSnapshot(
        redemption.discount_value_snapshot,
        redemption.applied_cycles_remaining
    )
}

/** Resultado de la RPC `resolve_active_discount` (forma del jsonb que devuelve la función DB). */
type ResolveActiveDiscountRpc = {
    redemption_id: string
    discount_value_snapshot: unknown
    applied_cycles_remaining: number | null
}

/**
 * Resuelve el descuento vivo del coach AUTENTICADO vía la RPC `resolve_active_discount` (SECURITY
 * DEFINER, sin param → `auth.uid()` interno, anti-IDOR). Para `subscription-status` (cliente
 * user-scoped que NO puede joinear el catálogo bajo RLS) → el precio mostrado == el cobrado.
 * Devuelve el spec + el código (para la UI `activeCoupon`) o `null`.
 */
export async function resolveActiveDiscountFromRpc(
    db: DB
): Promise<{ spec: DiscountSpec | null; redemptionId: string | null; code: string | null }> {
    const { data, error } = await db.rpc('resolve_active_discount')
    if (error || !data) return { spec: null, redemptionId: null, code: null }
    const row = data as ResolveActiveDiscountRpc
    const spec = discountSpecFromSnapshot(row.discount_value_snapshot, row.applied_cycles_remaining)
    const snap = (row.discount_value_snapshot ?? {}) as Record<string, unknown>
    const code = typeof snap.code === 'string' ? snap.code : null
    return { spec, redemptionId: row.redemption_id ?? null, code }
}

/**
 * GUARD de seguridad de cobro (O1, money-safety): MP rechaza `transaction_amount <= 0`. El path
 * PAGO debe rechazar un neto NO cobrable ANTES de cualquier llamada a preapproval. 100%-off (neto 0)
 * va por `admin_grant`, NUNCA por el path pago. Mínimo cobrable = 1 CLP.
 */
export const MIN_CHARGEABLE_CLP = 1

/** PURA: ¿el neto es cobrable por MP? (>= 1 CLP). false ⇒ el path pago debe rechazar / ruta admin_grant. */
export function isChargeableNetClp(netClp: number): boolean {
    return Number.isFinite(netClp) && netClp >= MIN_CHARGEABLE_CLP
}

/**
 * PURA: key de idempotencia para un PUT de monto cupón-driven (F2a.2b). Estable por (coach, monto):
 * un reintento del MISMO monto deduplica; un monto distinto es una operación nueva. Solo los PUTs con
 * cupón vivo lo mandan — los PUTs sin cupón omiten el header (comportamiento intacto). Sin timestamp
 * (un timestamp rompería el dedup). Scope por coach ya aísla; el monto distingue cambios de composite.
 */
export function buildAmountPutIdempotencyKey(coachId: string, amountClp: number): string {
    return `coupon-amt|${coachId}|${amountClp}`
}
