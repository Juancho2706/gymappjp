import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type { BillableAddon, BillingCycle, SubscriptionTier } from '@/domain/billing/types'
import { getCompositeAmountClp } from './addons.service'
import {
    discountSpecFromSnapshot,
    isChargeableNetClp,
    resolveActiveDiscountDetail,
    type DiscountValueSnapshot,
} from './discount.service'
import { normalizeCouponCode, normalizeEmailForFirstTime } from './coupons.normalize'
import {
    claimCouponCapacity,
    countRedemptionsForAccount,
    findActiveCouponByCode,
    insertRedemption,
    releaseCouponCapacity,
    type CouponCatalogRow,
} from '@/infrastructure/db/coupon-redemptions.repository'

type DB = SupabaseClient<Database>

/**
 * services/billing/coupons.service — canje de un código de descuento (F3). Valida elegibilidad,
 * reclama el cap global ATÓMICAMENTE (RPC) y escribe la redención (el trigger setea
 * coaches.active_coupon_redemption_id). NO hace PUT a MP: el descuento se aplica en el siguiente
 * recompute del preapproval (create-preference/upgrade ya threadean el spec, F2a.2b) — redeem↔PUT
 * deliberadamente NO en una sola tx. Devuelve un preview de precio (server-computed, evidencia SERNAC).
 */

export type RedeemErrorCode =
    | 'CODE_NOT_FOUND'
    | 'EXPIRED'
    | 'NOT_ELIGIBLE'
    | 'MODULE_DEFERRED'
    | 'MIN_AMOUNT'
    | 'ALREADY_REDEEMED'
    | 'CAP_REACHED'
    | 'NET_NOT_CHARGEABLE'
    | 'INSERT_FAILED'

export type CouponPreview = {
    baseBeforeDiscountClp: number
    discountClp: number
    totalClp: number
    couponCode: string
    durationLabel: string
}

export type RedeemCouponResult =
    | { ok: true; redemptionId: string; preview: CouponPreview }
    | { ok: false; code: RedeemErrorCode; message: string }

export type RedeemCouponInput = {
    code: string
    coachId: string
    coachEmail: string
    tier: SubscriptionTier
    cycle: BillingCycle
    billable: BillableAddon[]
    sourceIp: string | null
    couponTermsText: string | null
    couponTermsVersion: string | null
}

function durationLabel(duration: CouponCatalogRow['duration'], cycles: number | null): string {
    if (duration === 'forever') return 'de por vida'
    if (duration === 'once') return 'por 1 ciclo'
    return `por ${cycles ?? 1} ciclo(s)`
}

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

/**
 * Versión de la copia legal SERNAC. ⚠️ DRAFT hasta la firma de JP (rep SII) — el gate de dinero
 * (COUPON_REDEMPTION_ENABLED) está OFF en prod hasta entonces (plan O3). NO subir a un valor "firmado"
 * sin la aprobación legal.
 */
export const COUPON_TERMS_VERSION = 'sernac-v1-2026-06-DRAFT'

/**
 * PURA: texto de disclosure interpolado SOLO desde montos del SERVER (nunca cliente) → evidencia de
 * consentimiento persistida en coupon_redemptions.coupon_terms_text (Ley 19.496 art.28/30/35). La
 * variante "de por vida" omite la línea de reversión (no hay precio al que revierte).
 */
export function formatCouponTermsText(args: {
    code: string
    discountClp: number
    totalClp: number
    normalClp: number
    durationLabel: string
    isLifetime: boolean
}): string {
    const lines = [
        `Código ${args.code}: descuento de ${clp(args.discountClp)} ${args.durationLabel}.`,
        `Pagarás ${clp(args.totalClp)} (precio normal ${clp(args.normalClp)}) mientras el descuento esté vigente.`,
        'La suscripción se renueva automáticamente.',
    ]
    if (!args.isLifetime) {
        lines.push(`Al terminar el descuento, el precio vuelve a ${clp(args.normalClp)} en la siguiente renovación.`)
    }
    return lines.join(' ')
}

function appliedCyclesFor(duration: CouponCatalogRow['duration'], cycles: number | null): number | null {
    if (duration === 'forever') return null
    if (duration === 'once') return 1
    return cycles ?? 1 // repeating
}

/**
 * Canjea un código para el coach. PURO de side-effects salvo: claim del cap (RPC) + INSERT de la
 * redención. Si el INSERT falla tras reclamar, COMPENSA el cap (release). `db` DEBE ser service-role.
 */
export async function redeemCoupon(db: DB, input: RedeemCouponInput): Promise<RedeemCouponResult> {
    const codeNormalized = normalizeCouponCode(input.code)
    if (!codeNormalized) return { ok: false, code: 'CODE_NOT_FOUND', message: 'Ingresa un código.' }

    const row = await findActiveCouponByCode(db, codeNormalized)
    if (!row) return { ok: false, code: 'CODE_NOT_FOUND', message: 'El código no existe o no está activo.' }

    const now = Date.now()
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) {
        return { ok: false, code: 'EXPIRED', message: 'El código expiró.' }
    }
    if (row.redeemBy && new Date(row.redeemBy).getTime() <= now) {
        return { ok: false, code: 'EXPIRED', message: 'El código ya no se puede canjear.' }
    }
    if (row.restrictedToCoachId && row.restrictedToCoachId !== input.coachId) {
        return { ok: false, code: 'NOT_ELIGIBLE', message: 'Este código no está disponible para tu cuenta.' }
    }

    // Scope de tier (applies_to_scope.tiers). Vacío = aplica a cualquier tier.
    const scope = (row.appliesToScope ?? {}) as { tiers?: unknown; module_keys?: unknown; moduleKeys?: unknown }
    const scopeTiers = Array.isArray(scope.tiers) ? scope.tiers.filter((t): t is string => typeof t === 'string') : []
    if (scopeTiers.length > 0 && !scopeTiers.includes(input.tier)) {
        return { ok: false, code: 'NOT_ELIGIBLE', message: 'El código no aplica a tu plan actual.' }
    }

    // F2b DIFERIDO: target=module se rechaza al canje hasta que F2b esté live (no escribir una redención
    // que descuenta un módulo específico — el motor lo computa pero la fase no está habilitada).
    const moduleKeysRaw = scope.module_keys ?? scope.moduleKeys
    const moduleKeys = Array.isArray(moduleKeysRaw)
        ? moduleKeysRaw.filter((k): k is string => typeof k === 'string')
        : []
    if (row.fixedClpTarget === 'module' || moduleKeys.length > 0) {
        return { ok: false, code: 'MODULE_DEFERRED', message: 'Los códigos por módulo aún no están disponibles.' }
    }

    // Construir el snapshot congelado (evidencia) + el spec de precio (reusa el parser puro).
    const snapshot: DiscountValueSnapshot = {
        type: row.discountType,
        value: row.discountType === 'percent' ? row.percentValue ?? 0 : row.amountOffClp ?? 0,
        target: row.fixedClpTarget,
        code: row.codeDisplay ?? row.codeNormalized,
        ...(row.floorClp != null ? { floorClp: row.floorClp } : {}),
    }
    const appliedCycles = appliedCyclesFor(row.duration, row.durationInCycles)
    const spec = discountSpecFromSnapshot(snapshot as unknown as Json, appliedCycles)
    if (!spec) return { ok: false, code: 'CODE_NOT_FOUND', message: 'El código tiene una configuración inválida.' }

    // Preview server-side (precio mostrado == cobrado). minAmount sobre el composite de lista.
    const composite = getCompositeAmountClp(input.tier, input.cycle, input.billable, spec)
    if (row.minAmountClp != null && composite.baseBeforeDiscountClp < row.minAmountClp) {
        return { ok: false, code: 'MIN_AMOUNT', message: 'Tu plan no alcanza el mínimo para este código.' }
    }
    // Guard O1: el path pago no acepta neto no cobrable (100%-off → cortesía admin_grant, no código).
    if (!isChargeableNetClp(composite.totalClp)) {
        return { ok: false, code: 'NET_NOT_CHARGEABLE', message: 'Un código que deja el total en $0 se gestiona como cortesía, no por este medio.' }
    }

    // per_account_limit: nº de redenciones (cualquier estado) del cupón para esta cuenta.
    const priorRedemptions = await countRedemptionsForAccount(db, row.couponId, input.coachId)
    if (priorRedemptions >= row.perAccountLimit) {
        return { ok: false, code: 'ALREADY_REDEEMED', message: 'Ya usaste este código el máximo de veces permitido.' }
    }

    // Cap global ATÓMICO (RPC). false = lleno/inactivo.
    const claimed = await claimCouponCapacity(db, row.codeId)
    if (!claimed) return { ok: false, code: 'CAP_REACHED', message: 'Este código alcanzó su límite de canjes.' }

    // Evidencia SERNAC: texto interpolado SOLO desde montos del server (nunca cliente). Si el caller
    // (modal F5) ya pasó el texto exacto mostrado, se usa ese; si no, se construye server-side.
    const dLabel = durationLabel(row.duration, row.durationInCycles)
    const termsText =
        input.couponTermsText ??
        formatCouponTermsText({
            code: snapshot.code ?? row.codeNormalized,
            discountClp: composite.discountClp,
            totalClp: composite.totalClp,
            normalClp: composite.baseBeforeDiscountClp,
            durationLabel: dLabel,
            isLifetime: row.duration === 'forever',
        })

    // INSERT del ledger (índices únicos parciales = no-acumulación/first_time atómicos). Compensa el cap si falla.
    const inserted = await insertRedemption(db, {
        couponId: row.couponId,
        couponCodeId: row.codeId,
        coachId: input.coachId,
        discountValueSnapshot: snapshot as unknown as Json,
        appliedCyclesRemaining: appliedCycles,
        firstTimeOnly: row.firstTimeOnly,
        normalizedEmail: row.firstTimeOnly ? normalizeEmailForFirstTime(input.coachEmail) : null,
        couponTermsVersion: input.couponTermsVersion ?? COUPON_TERMS_VERSION,
        couponTermsText: termsText,
        sourceIp: input.sourceIp,
    })
    if (!inserted.ok) {
        await releaseCouponCapacity(db, row.codeId)
        return { ok: false, code: inserted.code, message: inserted.message }
    }

    return {
        ok: true,
        redemptionId: inserted.redemptionId,
        preview: {
            baseBeforeDiscountClp: composite.baseBeforeDiscountClp,
            discountClp: composite.discountClp,
            totalClp: composite.totalClp,
            couponCode: snapshot.code ?? row.codeNormalized,
            durationLabel: durationLabel(row.duration, row.durationInCycles),
        },
    }
}

/**
 * Lifecycle de ciclos (F4): decrementa applied_cycles_remaining del cupón vivo EXACTAMENTE una vez por
 * cobro (provider_payment_id), vía la fila companion `coupon_cycle_decrements` (UNIQUE). Al llegar a 0
 * marca la redención `expired` → el trigger nulea coaches.active_coupon_redemption_id (próximo cobro a
 * precio lleno). No-op para cupones `forever` (appliedCyclesRemaining null) o sin cupón vivo. Idempotente
 * ante reentrega del webhook + rama stale + recurring. `db` service-role. Best-effort: NO tumba el cobro.
 */
export async function decrementCouponCycleForCharge(
    db: DB,
    coachId: string,
    providerPaymentId: string
): Promise<{ decremented: boolean; expired: boolean }> {
    const detail = await resolveActiveDiscountDetail(db, coachId)
    if (!detail || detail.appliedCyclesRemaining == null) return { decremented: false, expired: false }

    // Idempotencia exactly-once: la fila companion (redemption_id, provider_payment_id) UNIQUE. Si ya
    // existe (reentrega / otra rama ya decrementó por este pago), 23505 → no-op.
    const { error: dupErr } = await db
        .from('coupon_cycle_decrements')
        .insert({ redemption_id: detail.redemptionId, provider_payment_id: providerPaymentId })
    if (dupErr) {
        if (/duplicate|unique|23505/i.test(dupErr.message)) return { decremented: false, expired: false }
        // Error inesperado: no decrementamos (mejor honrar un ciclo de más que cobrar de más por error).
        return { decremented: false, expired: false }
    }

    const next = detail.appliedCyclesRemaining - 1
    const willExpire = next <= 0
    await db
        .from('coupon_redemptions')
        .update({ applied_cycles_remaining: next, status: willExpire ? 'expired' : 'active' })
        .eq('id', detail.redemptionId)
    return { decremented: true, expired: willExpire }
}

/**
 * Revierte el cupón vivo del coach (refund/chargeback/expire terminal, F4): marca la redención `reverted`
 * → el trigger nulea el puntero, de modo que un coach reactivado arranca SIN descuento fantasma. No-op si
 * no hay cupón vivo. `db` service-role. Best-effort.
 */
export async function revertActiveCouponForCoach(db: DB, coachId: string): Promise<{ reverted: boolean }> {
    const { data: coach } = await db
        .from('coaches')
        .select('active_coupon_redemption_id')
        .eq('id', coachId)
        .maybeSingle()
    const redemptionId = coach?.active_coupon_redemption_id
    if (!redemptionId) return { reverted: false }
    await db
        .from('coupon_redemptions')
        .update({ status: 'reverted' })
        .eq('id', redemptionId)
        .eq('status', 'active')
    return { reverted: true }
}
