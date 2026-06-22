import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * infrastructure/db/coupon-redemptions.repository — acceso service-role al catálogo de cupones y al
 * ledger de redenciones (F3). El catálogo (coupons/coupon_codes) NO tiene SELECT para authenticated
 * (validación solo server-side) → todas estas lecturas son service-role. NO contiene lógica de negocio
 * (eso vive en coupons.service): mapea filas + el cap atómico (RPC) + el INSERT con sus errores tipados.
 */

/** Fila combinada coupon_codes + coupons (definición) para validar y construir el spec. */
export type CouponCatalogRow = {
    codeId: string
    couponId: string
    codeNormalized: string
    codeDisplay: string | null
    active: boolean
    expiresAt: string | null
    maxRedemptions: number | null
    redeemedCount: number
    perAccountLimit: number
    firstTimeOnly: boolean
    minAmountClp: number | null
    restrictedToCoachId: string | null
    // coupons
    discountType: 'percent' | 'fixed_clp'
    percentValue: number | null
    amountOffClp: number | null
    fixedClpTarget: 'base' | 'module' | 'total'
    appliesToScope: Json
    duration: 'once' | 'repeating' | 'forever'
    durationInCycles: number | null
    redeemBy: string | null
    floorClp: number | null
}

/** Lee el código ACTIVO por su forma normalizada + su cupón (definición). null si no existe/inactivo. */
export async function findActiveCouponByCode(
    db: DB,
    codeNormalized: string
): Promise<CouponCatalogRow | null> {
    const { data } = await db
        .from('coupon_codes')
        .select(
            'id, coupon_id, code_normalized, code_display, active, expires_at, max_redemptions, redeemed_count, per_account_limit, first_time_only, min_amount_clp, restricted_to_coach_id, coupons:coupon_id(discount_type, percent_value, amount_off_clp, fixed_clp_target, applies_to_scope, duration, duration_in_cycles, redeem_by)'
        )
        .eq('code_normalized', codeNormalized)
        .eq('active', true)
        .maybeSingle()
    if (!data) return null
    const c = (data.coupons ?? null) as {
        discount_type: 'percent' | 'fixed_clp'
        percent_value: number | null
        amount_off_clp: number | null
        fixed_clp_target: 'base' | 'module' | 'total'
        applies_to_scope: Json
        duration: 'once' | 'repeating' | 'forever'
        duration_in_cycles: number | null
        redeem_by: string | null
    } | null
    if (!c) return null
    const scope = (c.applies_to_scope ?? {}) as Record<string, unknown>
    const floorRaw = scope.floorClp
    return {
        codeId: data.id,
        couponId: data.coupon_id,
        codeNormalized: data.code_normalized,
        codeDisplay: data.code_display,
        active: data.active,
        expiresAt: data.expires_at,
        maxRedemptions: data.max_redemptions,
        redeemedCount: data.redeemed_count,
        perAccountLimit: data.per_account_limit,
        firstTimeOnly: data.first_time_only,
        minAmountClp: data.min_amount_clp,
        restrictedToCoachId: data.restricted_to_coach_id,
        discountType: c.discount_type,
        percentValue: c.percent_value,
        amountOffClp: c.amount_off_clp,
        fixedClpTarget: c.fixed_clp_target,
        appliesToScope: c.applies_to_scope,
        duration: c.duration,
        durationInCycles: c.duration_in_cycles,
        redeemBy: c.redeem_by,
        floorClp: typeof floorRaw === 'number' ? floorRaw : null,
    }
}

// Los RPCs claim/release son nuevos (migración 20260620140000) y aún no están en database.types.ts
// (se regeneran al aplicar a prod). Casteo localizado hasta el regen pre-live.
type RpcFn = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

/** Reclama atómicamente 1 cupo del cap global (RPC claim_coupon_code). true = reclamado. */
export async function claimCouponCapacity(db: DB, codeId: string): Promise<boolean> {
    const { data, error } = await (db.rpc as unknown as RpcFn)('claim_coupon_code', { p_code_id: codeId })
    if (error) return false
    return data === true
}

/** Compensa (decrementa) 1 cupo si el INSERT de la redención falla tras reclamar. */
export async function releaseCouponCapacity(db: DB, codeId: string): Promise<void> {
    await (db.rpc as unknown as RpcFn)('release_coupon_code', { p_code_id: codeId }).catch(() => undefined)
}

/** Nº de redenciones (cualquier estado) del cupón para una cuenta (per_account_limit). */
export async function countRedemptionsForAccount(
    db: DB,
    couponId: string,
    coachId: string
): Promise<number> {
    const { count } = await db
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', couponId)
        .eq('coach_id', coachId)
    return count ?? 0
}

/** Inserta el allowlist de correos de un cupón (REGISTER-CODE R1.0). Idempotente (PK (coupon_id,email)). */
export async function insertCouponAllowedEmails(
    db: DB,
    couponId: string,
    normalizedEmails: string[]
): Promise<void> {
    if (normalizedEmails.length === 0) return
    const rows = [...new Set(normalizedEmails)].map((e) => ({ coupon_id: couponId, normalized_email: e }))
    await db.from('coupon_allowed_emails').upsert(rows, { onConflict: 'coupon_id,normalized_email', ignoreDuplicates: true })
}

/**
 * Estado del allowlist de un cupón para un correo. `hasAllowlist` = el cupón restringe a una lista;
 * `allowed` = ese correo está en la lista. Sin allowlist → { hasAllowlist:false, allowed:true } (abierto).
 */
export async function getAllowlistStatus(
    db: DB,
    couponId: string,
    normalizedEmail: string
): Promise<{ hasAllowlist: boolean; allowed: boolean }> {
    const { count } = await db
        .from('coupon_allowed_emails')
        .select('coupon_id', { count: 'exact', head: true })
        .eq('coupon_id', couponId)
    if ((count ?? 0) === 0) return { hasAllowlist: false, allowed: true }
    const { data } = await db
        .from('coupon_allowed_emails')
        .select('coupon_id')
        .eq('coupon_id', couponId)
        .eq('normalized_email', normalizedEmail)
        .maybeSingle()
    return { hasAllowlist: true, allowed: !!data }
}

export type InsertRedemptionRow = {
    couponId: string
    couponCodeId: string
    coachId: string
    discountValueSnapshot: Json
    appliedCyclesRemaining: number | null
    firstTimeOnly: boolean
    normalizedEmail: string | null
    couponTermsVersion: string | null
    couponTermsText: string | null
    sourceIp: string | null
}

/** Resultado tipado del INSERT del ledger (mapea 23505 de los índices únicos a un código de negocio). */
export type InsertRedemptionResult =
    | { ok: true; redemptionId: string }
    | { ok: false; code: 'ALREADY_REDEEMED' | 'INSERT_FAILED'; message: string }

/**
 * Inserta la redención (append-only). El trigger setea coaches.active_coupon_redemption_id. Los índices
 * únicos parciales de F1 (one-active-per-coach, per-(coupon,email) first_time) hacen cumplir la
 * no-acumulación y el first_time atómicamente → 23505 se mapea a ALREADY_REDEEMED (no un 500).
 */
export async function insertRedemption(
    db: DB,
    row: InsertRedemptionRow
): Promise<InsertRedemptionResult> {
    const { data, error } = await db
        .from('coupon_redemptions')
        .insert({
            coupon_id: row.couponId,
            coupon_code_id: row.couponCodeId,
            coach_id: row.coachId,
            status: 'active',
            discount_value_snapshot: row.discountValueSnapshot,
            applied_cycles_remaining: row.appliedCyclesRemaining,
            first_time_only: row.firstTimeOnly,
            normalized_email: row.normalizedEmail,
            coupon_terms_version: row.couponTermsVersion,
            coupon_terms_text: row.couponTermsText,
            source_ip: row.sourceIp,
        })
        .select('id')
        .single()
    if (error) {
        if (/duplicate key|unique constraint|23505/i.test(error.message)) {
            return { ok: false, code: 'ALREADY_REDEEMED', message: 'Ya tienes un cupón activo o ya usaste este código.' }
        }
        return { ok: false, code: 'INSERT_FAILED', message: error.message }
    }
    return { ok: true, redemptionId: data.id }
}
