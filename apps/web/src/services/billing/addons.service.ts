import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    ADDON_CONFIG,
    BILLING_CYCLE_CONFIG,
    computeDiscountedClp,
    getTierCapabilities,
    getTierPriceClp,
    type BillingCycle,
    type DiscountSpec,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import type {
    ActivateAddonResult,
    BillableAddon,
    CancelAddonResult,
    CanPurchaseAddonResult,
    CoachAddon,
    CoachPurchaseContext,
} from '@/domain/billing/types'
import {
    insertAddon,
    listLive,
    requestCancel,
    revokeAdminGrant,
} from '@/infrastructure/db/coach-addons.repository'
import { MODULE_KEYS } from '@/services/entitlements.service'
import {
    buildAmountPutIdempotencyKey,
    resolveActiveDiscountSpec,
} from '@/services/billing/discount.service'

type DB = SupabaseClient<Database>

/**
 * services/billing/addons.service — núcleo de lógica del motor de cobro de add-ons
 * self-service (plan 05 F2). NO importa de `app/` ni de Next. Orquesta:
 *   dominio puro (cálculo compuesto + prorrateo + máquina de estados)
 *   → repository (`coach-addons.repository`, service-role)
 *   → puerto de pagos (`AddonPaymentsPort`, inyectado — desacopla de la implementación MP de F3).
 *
 * Decisiones del dueño congeladas (2026-06-11, NO re-litigar): $9.990/mes UNIFORME los 4
 * módulos; descuento por ciclo (trim −10%, anual −20%); TODOS los ciclos (incluido mensual)
 * = one-shot prorrateado inmediato + PUT del valor completo desde la renovación; compromiso
 * mínimo 1 ciclo; starter NO compra nutrition_exchanges (Pro+).
 */

// ── Puerto de pagos: SOLO las ops que este service necesita (F3 implementa en MP) ──
// Mantenerlo estrecho desacopla F2 de la extensión del provider de F3 (interface segregation):
// el endpoint/webhook inyecta un objeto que cumpla esta forma.
export interface AddonPaymentsPort {
    /** PUT /preapproval/{id}: sube/baja el monto del próximo cobro (sin re-autorizar al pagador).
     * `idempotencyKey` opcional → dedup de PUTs cupón-driven (F2a.2b); omitido = comportamiento intacto. */
    updateCheckoutAmount(checkoutId: string, amountClp: number, idempotencyKey?: string): Promise<void>
    /** Crea un pago one-shot (Checkout Pro clásico) y devuelve la URL de checkout. */
    createOneShotPayment(input: {
        coachId: string
        coachEmail: string
        amountClp: number
        description: string
        externalReference: string
        successUrl: string
        failureUrl: string
        pendingUrl: string
        webhookUrl: string
    }): Promise<{ checkoutUrl: string }>
}

// ── Puerto de cambio de plan compuesto en Flow (Ola 5, W1 lo implementa en FlowProvider) ──
// MP NO lo usa (su alta de add-on es one-shot diferido). El `subscriptionRef` es la sub Flow
// (coaches.subscription_provider_external_id). Flow prorratea/cobra SOLO via changePlan por debajo:
// devuelve cuanto cobro AL INSTANTE por la diferencia (`chargedNowClp`) — jamas sumamos un one-shot
// encima (doble cobro). Interface segregada: el alta Flow consume solo este metodo del provider.
export type FlowSubscriptionChange = {
    tier: SubscriptionTier
    cycle: BillingCycle
    /** Nuevo monto COMPUESTO congelado en el plan Flow (base + add-ons − cupon). Server-computed. */
    amountClp: number
    planLabel: string
    webhookUrl: string
}
export type FlowSubscriptionChangeResult = {
    applied: boolean
    /** Lo que Flow cobro AL INSTANTE por la diferencia (subida de monto). null si no reporto. */
    chargedNowClp: number | null
    /** Credito generado (bajada de monto → invoice $0). null si no aplica. */
    creditClp: number | null
}
export interface SubscriptionItemsPort {
    addSubscriptionItem(
        subscriptionRef: string,
        change: FlowSubscriptionChange
    ): Promise<FlowSubscriptionChangeResult>
}

const DAY_MS = 1000 * 60 * 60 * 24

// ── Precio del add-on: espejo de getTierPriceClp (mismos descuentos, redondeo POR ÍTEM) ──

/** Precio MENSUAL de lista del módulo (CLP). Fuente: ADDON_CONFIG ($9.990 uniforme). */
export function getAddonMonthlyPriceClp(key: ModuleKey): number {
    return ADDON_CONFIG[key].priceClpMensual
}

/**
 * Monto del add-on POR CICLO, derivado del mensual congelado con los MISMOS descuentos del
 * plan (`BILLING_CYCLE_CONFIG`: trim −10%, anual −20%). `Math.round` POR ÍTEM para que el
 * desglose de la UI sume exacto (espejo de `getTierPriceClp`/`applyDiscount` de @eva/tiers).
 */
export function getAddonCycleAmountClp(priceClpMensual: number, cycle: BillingCycle): number {
    const { months, discountPercent } = BILLING_CYCLE_CONFIG[cycle]
    const gross = priceClpMensual * months
    return Math.round(gross * (1 - discountPercent / 100))
}

/**
 * One-shot prorrateado (regla 2, TODOS los ciclos): fracción restante del ciclo
 * (días entre `now` y el corte / días del ciclo) × monto-por-ciclo, entero CLP, alineado al
 * corte real del preapproval. Mensual también la usa (totalDays = 1 mes × 30 = 30 días).
 *
 * Bordes:
 *   - alta el día del corte (o `now` >= corte) → mínimo 1 día (nunca $0: cubre el compromiso mínimo).
 */
export function getAddonProrationClp(
    priceClpMensual: number,
    cycle: BillingCycle,
    now: Date,
    currentPeriodEnd: Date
): number {
    const cycleAmount = getAddonCycleAmountClp(priceClpMensual, cycle)
    const totalDays = BILLING_CYCLE_CONFIG[cycle].months * 30 // base de prorrateo: meses × 30 días
    const rawRemainingDays = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / DAY_MS)
    // Mínimo 1 día (nunca $0); tope al ciclo completo (alta justo al inicio del período).
    const remainingDays = Math.min(Math.max(rawRemainingDays, 1), totalDays)
    const fraction = remainingDays / totalDays
    return Math.max(1, Math.round(cycleAmount * fraction))
}

// ── Prorrateo de upgrade de tier (plan estrategia 06) ─────────────────────────

/**
 * One-shot prorrateado del UPGRADE de tier (espejo EXACTO de `getAddonProrationClp`): cobra
 * inmediato la DIFERENCIA de precio entre el tier nuevo y el actual, por la fracción que resta
 * del ciclo ACTUAL del coach (alineado al corte real del preapproval). El nuevo tier se activa
 * al confirmar el pago y el preapproval pasa al compuesto completo DESDE la siguiente renovación
 * (sin cobro inmediato del valor completo). Los add-ons NO entran en este one-shot.
 *
 * `diffCycleClp` es la diferencia sobre el CICLO ACTUAL del coach (mismo descuento de su ciclo).
 * Si la diferencia es <= 0 (no es un upgrade real de precio) devuelve 0 — el llamador exige > 0
 * antes de construir el one-shot.
 *
 * Bordes (idénticos a getAddonProrationClp):
 *   - upgrade el día del corte (o `now` >= corte) → mínimo 1 día (nunca $0).
 */
export function getTierUpgradeProrationClp(
    currentTier: SubscriptionTier,
    newTier: SubscriptionTier,
    cycle: BillingCycle,
    now: Date,
    currentPeriodEnd: Date
): number {
    const diffCycleClp = getTierPriceClp(newTier, cycle) - getTierPriceClp(currentTier, cycle)
    if (diffCycleClp <= 0) return 0
    const totalDays = BILLING_CYCLE_CONFIG[cycle].months * 30 // base de prorrateo: meses × 30 días
    const rawRemainingDays = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / DAY_MS)
    // Mínimo 1 día (nunca $0); tope al ciclo completo (upgrade justo al inicio del período).
    const remainingDays = Math.min(Math.max(rawRemainingDays, 1), totalDays)
    const fraction = remainingDays / totalDays
    return Math.max(1, Math.round(diffCycleClp * fraction))
}

// ── Facturabilidad + monto compuesto ──────────────────────────────────────────

/**
 * regla 3 en una línea: factura si `active` OR (`cancel_pending` AND `first_charged_at IS NULL`).
 * La rama `first_charged_at IS NULL` solo puede darse en ciclo MENSUAL (en trim/anual la fila
 * nace con el one-shot ya cobrado → `first_charged_at` seteado). La función es la misma.
 */
export function isAddonBillable(row: Pick<CoachAddon, 'status' | 'firstChargedAt'>): boolean {
    if (row.status === 'active') return true
    return row.status === 'cancel_pending' && row.firstChargedAt === null
}

/**
 * EL ÚNICO cálculo del monto compuesto del sistema (lo consumen create-preference, el PUT,
 * la UI y los tests): precio del tier por ciclo + Σ del monto-por-ciclo de cada add-on
 * facturable. El llamador filtra con `isAddonBillable` antes de pasar `billableAddons`.
 */
/** Composite con descuento de cupon aplicado (F2a): neto + desglose para evidencia/snapshot. */
export type CompositeWithDiscount = {
    totalClp: number                // neto cobrado (composite - descuento, con piso)
    baseBeforeDiscountClp: number   // composite (base + add-ons) ANTES del cupon
    discountClp: number             // descuento efectivo aplicado
}

// Overload: sin 4º arg → number legacy (callers existentes IDENTICOS). Con `discount` (spec o
// null) → resultado estructurado. El descuento se re-resuelve server-side en el call site y se
// pasa aca → un solo chokepoint; el webhook/cron recomputan con el MISMO spec (drift-safe).
export function getCompositeAmountClp(
    tier: SubscriptionTier,
    cycle: BillingCycle,
    billableAddons: BillableAddon[]
): number
export function getCompositeAmountClp(
    tier: SubscriptionTier,
    cycle: BillingCycle,
    billableAddons: BillableAddon[],
    discount: DiscountSpec | null
): CompositeWithDiscount
export function getCompositeAmountClp(
    tier: SubscriptionTier,
    cycle: BillingCycle,
    billableAddons: BillableAddon[],
    discount?: DiscountSpec | null
): number | CompositeWithDiscount {
    const base = getTierPriceClp(tier, cycle)
    const addonLines = billableAddons.map((a) => ({
        moduleKey: a.moduleKey,
        cycleAmountClp: getAddonCycleAmountClp(a.priceClpMensual, cycle),
    }))
    const addonsTotal = addonLines.reduce((sum, a) => sum + a.cycleAmountClp, 0)
    // Sin 4º arg → comportamiento legacy IDENTICO.
    if (discount === undefined) return base + addonsTotal
    const r = computeDiscountedClp({ baseClp: base, addons: addonLines, spec: discount })
    return { totalClp: r.netClp, baseBeforeDiscountClp: r.baseBeforeDiscountClp, discountClp: r.discountClp }
}

/** Add-ons facturables como `BillableAddon[]` (para alimentar `getCompositeAmountClp`). */
export function toBillableAddons(addons: CoachAddon[]): BillableAddon[] {
    return addons
        .filter((a) => a.source === 'self_service' && isAddonBillable(a))
        .map((a) => ({ moduleKey: a.moduleKey, priceClpMensual: a.priceClpMensual }))
}

// ── Gating de compra (D8) ──────────────────────────────────────────────────────

const PAID_ACTIVE_STATUSES = new Set(['active', 'trialing'])

/**
 * D8 — requisitos de compra:
 *   - plan pago activo (no free, status activo con preapproval donde sumar el monto);
 *   - `nutrition_exchanges` exige tier con nutrición (Pro+; starter NO);
 *   - coach de team/org: excluido (sus add-ons van por contrato).
 * El kill-switch (`EVA_DISABLED_MODULES`) NO bloquea la compra: es palanca de incidentes.
 */
export function canPurchaseAddon(
    coach: CoachPurchaseContext,
    key: ModuleKey
): CanPurchaseAddonResult {
    if (coach.isManagedByTeamOrOrg) {
        return { allowed: false, reason: 'managed_by_team_or_org' }
    }
    const tier = coach.subscriptionTier
    const status = coach.subscriptionStatus ?? ''
    // Plan pago activo = tier pago + status activo con preapproval vivo donde sumar el monto.
    // 'canceled'/'expired' conservan acceso hasta current_period_end pero NO tienen preapproval
    // vivo: no hay dónde sumar el add-on (deben recontratar primero) → no es plan pago activo.
    const hasActivePaidPlan = tier !== 'free' && PAID_ACTIVE_STATUSES.has(status)
    if (!hasActivePaidPlan) {
        return { allowed: false, reason: 'no_paid_plan' }
    }
    if (key === 'nutrition_exchanges' && !getTierCapabilities(tier).canUseNutrition) {
        return { allowed: false, reason: 'requires_nutrition_tier' }
    }
    return { allowed: true }
}

/**
 * Descuento del cupón aplicable al ONE-SHOT prorrateado de UN módulo. A diferencia del PUT
 * recurrente (composite completo — el motor `computeDiscountedClp` maneja todos los target), el
 * one-shot es UNA línea de add-on parcial: SOLO un `percent` que cubra ese add-on lo descuenta —
 * `target='total'` (cubre todo) o `target='module'` con la key incluida. `base` NO toca add-ons;
 * `fixed_clp` sobre la fracción de un único módulo sobre-acreditaría (se omite, igual que el one-shot
 * del upgrade en create-preference). Piso $1 (MP rechaza <= 0). spec null = sin cambio.
 */
export function applyCouponToAddonProration(
    prorationClp: number,
    key: ModuleKey,
    spec: DiscountSpec | null
): number {
    if (!spec || spec.type !== 'percent') return prorationClp
    const coversAddon =
        spec.target === 'total' ||
        (spec.target === 'module' && (spec.moduleKeys?.includes(key) ?? false))
    if (!coversAddon) return prorationClp
    const pct = Math.min(100, Math.max(0, spec.value))
    return Math.max(1, prorationClp - Math.round((prorationClp * pct) / 100))
}

// ── Alta: one-shot prorrateado, TODOS los ciclos (D4) ────────────────────────────

export type ActivateAddonContext = {
    coachId: string
    coachEmail: string
    tier: SubscriptionTier
    cycle: BillingCycle
    /** id del preapproval MP del coach (para el PUT de monto). */
    subscriptionMpId: string
    /** Corte actual del preapproval (para alinear el prorrateo). */
    currentPeriodEnd: Date
    /** URLs del checkout one-shot (back_urls + notification) — el route las deriva de NEXT_PUBLIC_SITE_URL. */
    successUrl: string
    failureUrl: string
    pendingUrl: string
    webhookUrl: string
    now?: Date
}

/**
 * Alta in-app de un suscriptor activo — one-shot prorrateado para TODOS los ciclos (D4):
 * crea la preference de pago one-shot (monto de `getAddonProrationClp` por la fracción que
 * resta del período actual) y devuelve la URL de checkout SIN crear fila — la fila la
 * materializa el webhook al aprobarse el pago (`materializeAddonFromOneShot`), que también
 * hace el PUT del valor completo del add-on al preapproval DESDE la renovación. Cero filas en
 * checkout abandonado. Mensual ya no es cortesía: prorratea igual que trim/anual.
 *
 * `db` debe ser service-role (escribe coach_addons). El monto SIEMPRE lo calcula el server.
 */
export async function activateAddonForCoach(
    db: DB,
    payments: AddonPaymentsPort,
    ctx: ActivateAddonContext,
    key: ModuleKey,
    termsVersion: string
): Promise<ActivateAddonResult> {
    const priceClpMensual = getAddonMonthlyPriceClp(key)

    // One-shot prorrateado inmediato (mensual/trim/anual); la fila la crea el webhook.
    const now = ctx.now ?? new Date()
    const fullProrationClp = getAddonProrationClp(priceClpMensual, ctx.cycle, now, ctx.currentPeriodEnd)
    // Cupón vivo (forever o N-ciclos): un % sobre TODA la cuenta (target='total') descuenta también la
    // proración del módulo, para no cobrar el one-shot a precio lleno mientras el plan está con cupón.
    const spec = await resolveActiveDiscountSpec(db, ctx.coachId)
    const prorationClp = applyCouponToAddonProration(fullProrationClp, key, spec)
    const cycleAmountClp = getAddonCycleAmountClp(priceClpMensual, ctx.cycle)
    const externalReference = buildOneShotExternalReference(ctx.coachId, key, termsVersion)
    const { checkoutUrl } = await payments.createOneShotPayment({
        coachId: ctx.coachId,
        coachEmail: ctx.coachEmail,
        amountClp: prorationClp,
        description: `Activación prorrateada — ${ADDON_CONFIG[key].label}`,
        externalReference,
        successUrl: ctx.successUrl,
        failureUrl: ctx.failureUrl,
        pendingUrl: ctx.pendingUrl,
        webhookUrl: ctx.webhookUrl,
    })
    return { kind: 'one_shot_checkout', checkoutUrl, prorationClp, cycleAmountClp }
}

// ── Alta: coach FLOW (Ola 5, W2) — cambio de plan SINCRONO ────────────────────────

export type ActivateAddonFlowContext = {
    coachId: string
    tier: SubscriptionTier
    cycle: BillingCycle
    /** Ref de la sub Flow (coaches.subscription_provider_external_id) — NUNCA el mp_id. */
    subscriptionRef: string
    planLabel: string
    webhookUrl: string
    /** Corte actual: fallback de proración si Flow no reporta el monto cobrado. */
    currentPeriodEnd: Date
    now?: Date
}

export type ActivateAddonFlowResult = {
    addon: CoachAddon
    /** Monto que Flow cobró AL INSTANTE por la diferencia (evidencia del snapshot). */
    chargedNowClp: number
    /** Nuevo compuesto congelado en el plan Flow (base + add-ons − cupón). */
    newCompositeAmountClp: number
}

/**
 * Alta de add-on para un coach FLOW. A diferencia de MP (one-shot prorrateado async, confirmado
 * por webhook), Flow es SÍNCRONO: `addSubscriptionItem` (changePlan por debajo) sube el plan al
 * nuevo compuesto y Flow COBRA la diferencia al instante (validado en sandbox). Por eso NO hay
 * one-shot nuestro (sería doble cobro) y la fila `coach_addons` se inserta AHORA (el cobro ya
 * ocurrió → `firstChargedAt` = ahora; el trigger D1 prende el módulo).
 *
 * Orden money-safety: PRIMERO el cambio en Flow (si tira, NADA se inserta), DESPUÉS la fila.
 * Idempotente por el índice único parcial (doble submit / carrera con el reconcile).
 *
 * `db` service-role. `provider` = FlowProvider vía `SubscriptionItemsPort`.
 */
export async function activateAddonForCoachFlow(
    db: DB,
    provider: SubscriptionItemsPort,
    ctx: ActivateAddonFlowContext,
    key: ModuleKey,
    termsVersion: string
): Promise<ActivateAddonFlowResult> {
    const priceClpMensual = getAddonMonthlyPriceClp(key)
    // Nuevo compuesto = filas vivas facturables + el módulo nuevo (aún sin fila). Mismo helper que
    // create-preference/confirm-enrollment (ÚNICA fuente de la plata). Honra el cupón vivo.
    const live = await listLive(db, ctx.coachId)
    const billable = toBillableAddons(live)
    const withNew: BillableAddon[] = billable.some((a) => a.moduleKey === key)
        ? billable
        : [...billable, { moduleKey: key, priceClpMensual }]
    const spec = await resolveActiveDiscountSpec(db, ctx.coachId)
    const newCompositeAmountClp = getCompositeAmountClp(ctx.tier, ctx.cycle, withNew, spec).totalClp

    // PRIMERO el cambio en Flow. Flow cobra la diferencia SOLO (nunca sumamos one-shot encima).
    const change = await provider.addSubscriptionItem(ctx.subscriptionRef, {
        tier: ctx.tier,
        cycle: ctx.cycle,
        amountClp: newCompositeAmountClp,
        planLabel: ctx.planLabel,
        webhookUrl: ctx.webhookUrl,
    })
    if (!change.applied) {
        throw new Error('Flow addSubscriptionItem: el cambio de plan no se aplicó.')
    }

    // El cobro YA ocurrió → insertar la fila (firstChargedAt = ahora). Idempotente por el índice único.
    const now = ctx.now ?? new Date()
    let addon: CoachAddon
    try {
        addon = await insertAddon(db, {
            coachId: ctx.coachId,
            moduleKey: key,
            source: 'self_service',
            priceClpMensual,
            termsVersion,
            firstChargedAt: now.toISOString(),
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/one_live_per_module|duplicate key|unique constraint/i.test(msg)) throw err
        const existing = (await listLive(db, ctx.coachId)).find(
            (a) => a.moduleKey === key && a.source === 'self_service'
        )
        if (!existing) throw err
        addon = existing
    }

    // chargedNowClp: lo que Flow reportó haber cobrado; fallback a la proración server-computed.
    const chargedNowClp =
        typeof change.chargedNowClp === 'number' && change.chargedNowClp > 0
            ? change.chargedNowClp
            : getAddonProrationClp(priceClpMensual, ctx.cycle, now, ctx.currentPeriodEnd)

    return { addon, chargedNowClp, newCompositeAmountClp }
}

/** `external_reference` dedicado del one-shot (1ª parte NO es uuid de coach → el parser de suscripción no lo confunde). */
export function buildOneShotExternalReference(
    coachId: string,
    key: ModuleKey,
    termsVersion: string
): string {
    return `addon_oneshot|${coachId}|${key}|${termsVersion}`
}

/**
 * Materializa la fila tras un one-shot APROBADO (consumida por el webhook, trim/anual): crea
 * la fila con `first_charged_at` = fecha del pago (trigger D1 prende el módulo) y ejecuta el
 * PUT que suma el add-on al preapproval DESDE la renovación. Idempotente por el índice único
 * parcial: si ya existe una fila viva del módulo (doble clic / reintento), no crea otra.
 *
 * `db` service-role. Devuelve la fila creada (o la viva preexistente) y el nuevo compuesto.
 */
export async function materializeAddonFromOneShot(
    db: DB,
    payments: AddonPaymentsPort,
    ctx: {
        coachId: string
        tier: SubscriptionTier
        cycle: BillingCycle
        subscriptionMpId: string
    },
    key: ModuleKey,
    termsVersion: string,
    paidAt: string
): Promise<{ addon: CoachAddon; newCompositeAmountClp: number }> {
    // Idempotencia: si ya hay fila viva del módulo (self_service), no duplicar (doble clic).
    const existing = (await listLive(db, ctx.coachId)).find(
        (a) => a.moduleKey === key && a.source === 'self_service'
    )
    let addon = existing
    if (!addon) {
        try {
            addon = await insertAddon(db, {
                coachId: ctx.coachId,
                moduleKey: key,
                source: 'self_service',
                priceClpMensual: getAddonMonthlyPriceClp(key),
                termsVersion,
                firstChargedAt: paidAt, // one-shot ya cobrado: compromiso mínimo cubierto
            })
        } catch (err) {
            // Carrera confirm-addon <-> webhook: la fila se creó entremedio (índice único parcial)
            // -> re-leer la fila viva en vez de propagar la violación (evita un 500 espurio).
            const msg = err instanceof Error ? err.message : String(err)
            if (!/one_live_per_module|duplicate key|unique constraint/i.test(msg)) throw err
            addon = (await listLive(db, ctx.coachId)).find(
                (a) => a.moduleKey === key && a.source === 'self_service'
            )
            if (!addon) throw err
        }
    }
    const live = await listLive(db, ctx.coachId)
    // El PUT debe HONRAR el cupón vivo: sin el spec, sumar el add-on recomputaría el preapproval a
    // precio LLENO y BORRARÍA el descuento de la base (incidente jun-2026). spec null = idéntico a hoy.
    const spec = await resolveActiveDiscountSpec(db, ctx.coachId)
    const newCompositeAmountClp = getCompositeAmountClp(ctx.tier, ctx.cycle, toBillableAddons(live), spec).totalClp
    // PUT: suma el add-on al monto del preapproval DESDE la renovación (con el cupón vivo si hay).
    await payments.updateCheckoutAmount(
        ctx.subscriptionMpId,
        newCompositeAmountClp,
        spec ? buildAmountPutIdempotencyKey(ctx.coachId, newCompositeAmountClp) : undefined
    )
    return { addon, newCompositeAmountClp }
}

// ── Baja: máquina de estados (reglas 3-4) ────────────────────────────────────────

export type CancelAddonContext = {
    coachId: string
    tier: SubscriptionTier
    cycle: BillingCycle
    subscriptionMpId: string
    /** Corte actual del preapproval (fin del período ya pagado → expires_at de la baja). */
    currentPeriodEnd: Date
    /**
     * Gateway del coach (Ola 5, B5). 'flow' → en regla 4 NO se ejecuta el changePlan-DOWN inmediato
     * (se difiere al corte vía cron para no acreditar el ciclo ya cobrado). Ausente/'mercadopago' → PUT
     * inmediato (comportamiento intacto). Los callers legacy que no lo setean caen en el path MP.
     */
    provider?: 'mercadopago' | 'flow'
    now?: Date
}

/**
 * Baja de un add-on (reglas 3-4):
 *   - `first_charged_at` SETEADO (regla 4): `cancel_pending` + PUT que BAJA el monto YA
 *     (próximo cobro lo excluye); `expires_at` = fin del período ya pagado. Esta rama cubre
 *     SIEMPRE trim/anual (el one-shot ya cobró → first_charged_at seteado).
 *   - `first_charged_at` NULL (regla 3, SOLO mensual): `cancel_pending` SIN bajar el monto
 *     (el próximo corte lo cobra igual — compromiso mínimo); `expires_at` queda null y se fija
 *     recién al primer cobro (vía webhook). PUT diferido.
 *
 * `db` service-role. Devuelve la fecha efectiva y si el PUT ya se aplicó.
 */
export async function requestAddonCancellation(
    db: DB,
    payments: AddonPaymentsPort,
    ctx: CancelAddonContext,
    key: ModuleKey
): Promise<CancelAddonResult> {
    const live = await listLive(db, ctx.coachId)
    const addon = live.find((a) => a.moduleKey === key && a.source === 'self_service')
    if (!addon) {
        throw new Error('No hay un add-on activo de ese módulo para cancelar.')
    }
    const now = ctx.now ?? new Date()
    const nowIso = now.toISOString()

    if (addon.firstChargedAt !== null) {
        // Regla 4: ya cobrado → expires_at al corte (fin del período ya pagado). El PUT/changePlan-DOWN
        // que excluye el add-on del próximo cobro se aplica INMEDIATO en MP; en Flow se DIFIERE al corte.
        const expiresAt = ctx.currentPeriodEnd.toISOString()
        const updated = await requestCancel(db, addon.id, {
            cancelRequestedAt: nowIso,
            expiresAt,
        })

        // ── B5: coach FLOW → NO ejecutar el changePlan-DOWN inmediato ─────────────────────────────────
        // En Flow, bajar el monto de la sub mid-ciclo (subscription/changePlan) genera un balance
        // NEGATIVO = CREDITO del ciclo YA cobrado (Flow emite invoice $0 y acredita la diferencia). Eso
        // VIOLA la regla 4 disclosed (el add-on se cobra hasta el fin del período ya pagado) y habilita un
        // loop comprar→cancelar gratis (acreditar cada ciclo lo vuelve $0 efectivo). Por eso la baja del
        // monto se DIFIERE al corte: el cron (mp-reconcile, pasada de expiry) corre el changePlan-down
        // cuando la fila expira. La fila queda cancel_pending + expires_at al corte IGUAL que MP; el módulo
        // se apaga al expirar (trigger D1). En MP el PUT baja el PRÓXIMO cobro sin tocar el ciclo actual
        // → se mantiene inmediato. PIN Ola 6: semántica exacta del balance mid-ciclo de Flow (el sandbox
        // no viaja en el tiempo para confirmar si es prorrateado o delta completo).
        if (ctx.provider === 'flow') {
            return {
                moduleKey: key,
                status: updated?.status ?? 'cancel_pending',
                effectiveAt: expiresAt,
                putApplied: false,
            }
        }

        // MP: el monto nuevo excluye al add-on que se va de baja. Re-leer las filas vivas tras el
        // update y recomputar (el add-on en cancel_pending YA cobrado deja de ser facturable).
        const liveAfter = await listLive(db, ctx.coachId)
        // HONRAR el cupón vivo: sin el spec el PUT-down recomputaría a precio LLENO y borraría el
        // descuento de la base al quitar un módulo (mismo pecado que la materialización).
        const spec = await resolveActiveDiscountSpec(db, ctx.coachId)
        const newComposite = getCompositeAmountClp(ctx.tier, ctx.cycle, toBillableAddons(liveAfter), spec).totalClp
        // La fila YA quedó cancel_pending (requestCancel arriba). Si el PUT que baja el monto del
        // preapproval falla (preapproval pausado / MP caído / id inválido), NO tumbamos la baja: el
        // reconcile diario detecta el drift y reintenta. Devolver error dejaría la baja aplicada en DB
        // pero al usuario con un 500 (y el over-bill ocurriría igual hasta el reconcile).
        let putApplied = false
        try {
            await payments.updateCheckoutAmount(
                ctx.subscriptionMpId,
                newComposite,
                spec ? buildAmountPutIdempotencyKey(ctx.coachId, newComposite) : undefined
            )
            putApplied = true
        } catch (err) {
            console.error('[addons.cancel] PUT del monto falló — baja igual aplicada, reconcile reintenta', {
                coachId: ctx.coachId,
                moduleKey: key,
                message: err instanceof Error ? err.message : String(err),
            })
        }
        return {
            moduleKey: key,
            status: updated?.status ?? 'cancel_pending',
            effectiveAt: expiresAt,
            putApplied,
        }
    }

    // Regla 3 (solo mensual): compromiso mínimo. cancel_pending SIN PUT; expires_at diferido.
    const updated = await requestCancel(db, addon.id, {
        cancelRequestedAt: nowIso,
        expiresAt: null,
    })
    return {
        moduleKey: key,
        status: updated?.status ?? 'cancel_pending',
        effectiveAt: null, // se fija al primer cobro (regla 3) — la UI muestra "tras tu primer cobro"
        putApplied: false,
    }
}

// ── Override del CEO: write-through admin_grant (D2 / plan 05 F6.1) ───────────────

/** `terms_version` sentinela de los grants del CEO (cortesía — no se rigen por reglas de pago). */
export const ADMIN_GRANT_TERMS_VERSION = 'admin_grant' as const

/**
 * Resultado del write-through del override del CEO: qué módulos se otorgaron (insert de fila
 * `admin_grant`) y cuáles se retiraron (cancel duro del grant) en esta pasada. Para el audit log.
 */
export type SyncAdminGrantsResult = {
    granted: ModuleKey[]
    revoked: ModuleKey[]
}

/**
 * Override del CEO para standalone como WRITE-THROUGH de `coach_addons` (D2): en vez de escribir
 * `coaches.enabled_modules` directo (que el trigger D1 pisaría en la próxima mutación de add-ons),
 * el toggle del CEO crea/cancela filas `admin_grant` (`price_clp=0`, NUNCA facturan) — el trigger
 * recomputa `enabled_modules` en la misma transacción. Una sola fuente de verdad: sin carrera, con
 * cortesías auditables y excluidas del monto compuesto.
 *
 * Diffea el mapa deseado (`desired`, una entrada por MODULE_KEY) contra las filas vivas `admin_grant`:
 *   - deseado ON sin grant vivo  → INSERT fila admin_grant (idempotente: si ya hay grant vivo, no-op).
 *   - deseado OFF con grant vivo  → cancel DURO del grant (coexiste con la fila paga: si el módulo
 *     también está pago, sigue ON por esa fila — el grant y el pago son filas distintas, D2).
 *
 * NO toca filas `self_service`: retirar la cortesía jamás cancela un add-on que el coach paga.
 * `db` debe ser service-role. Idempotente (re-correr con el mismo `desired` no cambia nada).
 */
export async function syncAdminGrants(
    db: DB,
    coachId: string,
    desired: Record<string, boolean>
): Promise<SyncAdminGrantsResult> {
    const live = await listLive(db, coachId)
    const liveGrants = new Set(
        live.filter((a) => a.source === 'admin_grant').map((a) => a.moduleKey)
    )
    const nowIso = new Date().toISOString()
    const granted: ModuleKey[] = []
    const revoked: ModuleKey[] = []

    for (const key of MODULE_KEYS) {
        const wantOn = desired[key] === true
        const hasGrant = liveGrants.has(key)
        if (wantOn && !hasGrant) {
            await insertAddon(db, {
                coachId,
                moduleKey: key,
                source: 'admin_grant',
                priceClpMensual: 0, // cortesía: NUNCA factura (D2)
                termsVersion: ADMIN_GRANT_TERMS_VERSION,
            })
            granted.push(key)
        } else if (!wantOn && hasGrant) {
            await revokeAdminGrant(db, coachId, key, nowIso)
            revoked.push(key)
        }
    }

    return { granted, revoked }
}
