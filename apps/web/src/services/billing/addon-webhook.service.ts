import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
    ADDON_CONFIG,
    getAddonPaymentRulesForCycle,
    getTierPriceClp,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import type { CoachAddon } from '@/domain/billing/types'
import {
    getAddonCycleAmountClp,
    getCompositeAmountClp,
    toBillableAddons,
    type AddonPaymentsPort,
} from '@/services/billing/addons.service'
import {
    insertAddon,
    listLive,
    markFirstCharged,
} from '@/infrastructure/db/coach-addons.repository'

type DB = SupabaseClient<Database>

/**
 * services/billing/addon-webhook — hooks de add-ons que ejecuta el webhook de pagos (plan 05 F3.4).
 * Aislado del route para que sea unit-testeable con provider + db mockeados (NO toca red ni MP).
 *
 * Cada hook es idempotente: el webhook MP puede reentregar el mismo evento (el route dedup por
 * provider_event_id, pero estos hooks no asumen ese dedup — `markFirstCharged` es set-once,
 * el snapshot es idempotente por provider_payment_id, la materialización por el índice único parcial).
 *
 * `db` SIEMPRE service-role (escribe coach_addons / billing_snapshots).
 */

// ── Desglose base + add-ons para billing_snapshots y el payload de eventos ─────────

export type AddonSnapshotLine = {
    module_key: ModuleKey
    price_clp: number
    cycle_amount_clp: number
}

/** Líneas del desglose de add-ons facturables (precio mensual congelado + monto del ciclo). */
export function buildAddonBreakdown(
    addons: CoachAddon[],
    cycle: BillingCycle
): AddonSnapshotLine[] {
    return toBillableAddons(addons).map((a) => ({
        module_key: a.moduleKey,
        price_clp: a.priceClpMensual,
        cycle_amount_clp: getAddonCycleAmountClp(a.priceClpMensual, cycle),
    }))
}

/**
 * Inserta el snapshot del desglose congelado de un cobro aprobado (recurrente u one-shot).
 * Idempotente por `provider_payment_id` (UNIQUE en DB): un reintento del webhook no duplica.
 * Evidencia SERNAC de qué se cobró y por qué (F1.4).
 */
export async function insertBillingSnapshot(
    db: DB,
    input: {
        coachId: string
        providerPaymentId: string
        chargedAt: string
        tier: SubscriptionTier
        billingCycle: BillingCycle
        kind: 'recurring' | 'addon_proration'
        baseClp: number
        addons: AddonSnapshotLine[]
        totalClp: number
    }
): Promise<{ inserted: boolean }> {
    const row: Database['public']['Tables']['billing_snapshots']['Insert'] = {
        coach_id: input.coachId,
        provider_payment_id: input.providerPaymentId,
        charged_at: input.chargedAt,
        tier: input.tier,
        billing_cycle: input.billingCycle,
        kind: input.kind,
        base_clp: input.baseClp,
        addons: input.addons as unknown as Json,
        total_clp: input.totalClp,
    }
    // upsert con ignoreDuplicates: reintento del webhook = no-op (idempotente por provider_payment_id).
    const { error } = await db
        .from('billing_snapshots')
        .upsert(row, { onConflict: 'provider_payment_id', ignoreDuplicates: true })
    if (error) throw new Error(`insertBillingSnapshot: ${error.message}`)
    return { inserted: true }
}

/**
 * Materializa filas `coach_addons` a partir de los add-ons que viajan en el external_reference
 * de un preapproval `authorized` (signup / supersede con add-ons, D4). Idempotente por el índice
 * único parcial: si la fila viva ya existe (reentrega o supersede que re-upserta), no crea otra.
 *
 * `firstChargedAt` queda NULL (el preapproval nace con el ciclo completo compuesto; el primer
 * cobro recurrente lo setea vía `markFirstCharged`). Devuelve las filas creadas.
 */
export async function materializeAddonsFromPreapproval(
    db: DB,
    coachId: string,
    addons: ModuleKey[],
    termsVersion: string
): Promise<CoachAddon[]> {
    if (addons.length === 0) return []
    const live = await listLive(db, coachId)
    const liveKeys = new Set(
        live.filter((a) => a.source === 'self_service').map((a) => a.moduleKey)
    )
    const created: CoachAddon[] = []
    for (const key of addons) {
        if (liveKeys.has(key)) continue // idempotente: ya existe fila viva
        try {
            const row = await insertAddon(db, {
                coachId,
                moduleKey: key,
                source: 'self_service',
                priceClpMensual: getAddonMonthlyPriceForKey(key),
                termsVersion,
                firstChargedAt: null,
            })
            created.push(row)
        } catch (err) {
            // El índice único parcial puede rechazar una carrera de doble entrega: tratar como no-op.
            const msg = err instanceof Error ? err.message : String(err)
            if (!/duplicate|unique|coach_addons_one_live_per_module/i.test(msg)) throw err
        }
    }
    return created
}

/** Precio mensual de lista vigente del módulo (se re-congela al materializar la fila). */
function getAddonMonthlyPriceForKey(key: ModuleKey): number {
    return ADDON_CONFIG[key].priceClpMensual
}

/**
 * Primer cobro recurrente (regla 2/3, ciclo mensual): set-once de `first_charged_at` para las
 * filas facturables sin cobrar; si alguna estaba `cancel_pending` esperando el compromiso mínimo,
 * ejecuta AHORA el PUT que la excluye del próximo cobro y fija `expires_at`.
 *
 * Idempotente: `markFirstCharged` solo afecta filas con `first_charged_at IS NULL`; una segunda
 * pasada del mismo cobro no marca nada y no dispara PUT.
 */
export async function applyFirstChargeToAddons(
    db: DB,
    payments: AddonPaymentsPort,
    ctx: {
        coachId: string
        tier: SubscriptionTier
        cycle: BillingCycle
        subscriptionMpId: string
        /** Fin del período recién cobrado (próximo corte) → expires_at de bajas comprometidas. */
        currentPeriodEnd: string | null
    },
    chargedAt: string
): Promise<{ markedIds: string[]; putApplied: boolean }> {
    const marked = await markFirstCharged(db, ctx.coachId, chargedAt, {
        activatedBefore: chargedAt,
    })
    if (marked.length === 0) return { markedIds: [], putApplied: false }

    // Si alguna recién-cobrada estaba en cancel_pending (baja antes del 1er cobro, regla 3 mensual),
    // el compromiso mínimo ya se cumplió → bajarla ahora del próximo cobro y fijar expires_at.
    const committedCancels = marked.filter((a) => a.status === 'cancel_pending')
    let putApplied = false
    if (committedCancels.length > 0 && ctx.currentPeriodEnd) {
        const expiresAt = ctx.currentPeriodEnd
        for (const addon of committedCancels) {
            await db
                .from('coach_addons')
                .update({ expires_at: expiresAt })
                .eq('id', addon.id)
                .eq('status', 'cancel_pending')
        }
        // El monto nuevo del próximo cobro EXCLUYE las bajas ya cobradas (dejan de ser facturables).
        const liveAfter = await listLive(db, ctx.coachId)
        const newComposite = getCompositeAmountClp(ctx.tier, ctx.cycle, toBillableAddons(liveAfter))
        await payments.updateCheckoutAmount(ctx.subscriptionMpId, newComposite)
        putApplied = true
    }
    return { markedIds: marked.map((a) => a.id), putApplied }
}

/**
 * Confirma el PUT de monto a partir de un evento preapproval `updated` (mejora F3.4): compara
 * el monto vigente del preapproval (`providerAmountClp`) contra el compuesto esperado. Devuelve
 * el resultado para que el route loguee la confirmación o alerte el drift. NO escribe DB acá
 * (el route decide el subscription_event); función pura sobre los montos.
 *
 * validar en sandbox (item 8): el evento `updated` llega y trae el monto nuevo.
 */
export function reconcilePreapprovalAmount(input: {
    providerAmountClp: number | null | undefined
    expectedClp: number
}): { ok: boolean; drift: boolean; providerAmountClp: number | null; expectedClp: number } {
    const provider = typeof input.providerAmountClp === 'number' ? input.providerAmountClp : null
    if (provider === null) {
        // Sin monto en el payload no podemos confirmar — no es drift, pero tampoco confirma.
        return { ok: false, drift: false, providerAmountClp: null, expectedClp: input.expectedClp }
    }
    const drift = provider !== input.expectedClp
    return { ok: !drift, drift, providerAmountClp: provider, expectedClp: input.expectedClp }
}

/**
 * Texto íntegro de las 5 reglas aceptadas (variante del ciclo) para el payload del evento de ALTA
 * (mejora F3.4 / evidencia SERNAC): si el copy cambia en el futuro, queda probado qué aceptó el coach.
 */
export function buildAcceptedRulesPayload(cycle: BillingCycle) {
    return getAddonPaymentRulesForCycle(cycle)
}

/** Atajo expuesto para el route: base del tier (para componer el desglose del snapshot). */
export function tierBaseClp(tier: SubscriptionTier, cycle: BillingCycle): number {
    return getTierPriceClp(tier, cycle)
}
