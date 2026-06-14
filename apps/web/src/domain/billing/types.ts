/**
 * domain/billing — tipos puros del motor de cobro de add-ons self-service (plan 05 F2).
 *
 * CERO Next.js / Supabase / React. Espejan las columnas de `coach_addons` (migración
 * 20260612150000_coach_addons_selfservice_billing.sql) pero como tipos de NEGOCIO, no
 * como filas de DB: el mapeo snake_case (DB) → camelCase (dominio) vive en el repository.
 *
 * `domain/` no importa de `lib/`; los tipos de catálogo (`ModuleKey`, `BillingCycle`)
 * vienen del paquete puro `@eva/tiers` y de entitlements (array plano sin acoplar Supabase).
 */
import type { BillingCycle, SubscriptionTier } from '@eva/tiers'
import type { ModuleKey } from '@/services/entitlements.service'

/**
 * Máquina de estados del add-on (doc fuente §2.3):
 *   active ──baja──► cancel_pending ──(corte alcanzado)──► cancelled (terminal)
 * `cancelled` es terminal: reactivar un módulo crea una fila NUEVA (re-congela precio).
 */
export type AddonStatus = 'active' | 'cancel_pending' | 'cancelled'

/**
 * Origen de la fila:
 *   - `self_service`: el coach lo compró (factura; precio mensual de lista congelado).
 *   - `admin_grant`:  cortesía del CEO (price_clp = 0; NUNCA factura; D2). Coexiste con
 *     una fila paga del mismo módulo (índice único parcial incluye `source`).
 */
export type AddonSource = 'self_service' | 'admin_grant'

/** Add-on del coach como entidad de negocio (mapeo del repository, no fila de DB). */
export type CoachAddon = {
    id: string
    coachId: string
    moduleKey: ModuleKey
    status: AddonStatus
    source: AddonSource
    /** Precio MENSUAL de lista congelado al contratar (CLP). 0 en `admin_grant`. */
    priceClpMensual: number
    termsVersion: string
    termsAcceptedAt: string
    activatedAt: string
    /** Set-once por el webhook al primer cobro. `null` => aún sin cobrar (solo posible en mensual). */
    firstChargedAt: string | null
    cancelRequestedAt: string | null
    /** Fin del período ya pagado; al alcanzarse el add-on pasa a `cancelled`. */
    expiresAt: string | null
    cancelledAt: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Resultado de `activateAddonForCoach` — one-shot prorrateado para TODOS los ciclos (D4):
 * crea la preference de pago único (prorrateo del período restante) y devuelve la URL de
 * checkout; la fila `coach_addons` la materializa el webhook al aprobarse el pago (sin fila
 * todavía). Mensual ya no es cortesía: prorratea igual que trimestral/anual.
 */
export type ActivateAddonResult = {
    kind: 'one_shot_checkout'
    checkoutUrl: string
    /** Monto del one-shot prorrateado cobrado de inmediato (alineado al corte). */
    prorationClp: number
    /** Monto que se sumará al ciclo desde la renovación. */
    cycleAmountClp: number
}

/**
 * Resultado de `requestAddonCancellation` (reglas 3-4): fecha efectiva del término
 * y si el PUT que baja el monto del preapproval ya se aplicó (regla 4) o quedó
 * diferido al primer cobro por compromiso mínimo mensual (regla 3).
 */
export type CancelAddonResult = {
    moduleKey: ModuleKey
    status: AddonStatus
    /** ISO; fin del período ya pagado / próximo corte. `null` si aún no se conoce (compromiso mensual). */
    effectiveAt: string | null
    /** true => ya se bajó el monto en MP (regla 4); false => se baja recién tras el 1er cobro (regla 3). */
    putApplied: boolean
}

/** Snapshot mínimo del coach para `canPurchaseAddon` (entradas puras — el service no lee DB acá). */
export type CoachPurchaseContext = {
    subscriptionTier: SubscriptionTier
    subscriptionStatus: string | null
    /** true si el coach pertenece a un team o una org (sus add-ons van por contrato — excluidos). */
    isManagedByTeamOrOrg: boolean
    currentPeriodEnd: string | null
}

/** Razón por la que un módulo NO se puede comprar (para copy del catálogo). */
export type AddonPurchaseDenialReason =
    | 'no_paid_plan'
    | 'requires_nutrition_tier'
    | 'managed_by_team_or_org'

export type CanPurchaseAddonResult =
    | { allowed: true }
    | { allowed: false; reason: AddonPurchaseDenialReason }

/** Línea de add-on facturable usada por el cálculo del monto compuesto. */
export type BillableAddon = {
    moduleKey: ModuleKey
    priceClpMensual: number
}

export type { BillingCycle, SubscriptionTier }
