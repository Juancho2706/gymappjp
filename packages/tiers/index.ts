/**
 * @eva/tiers — fuente ÚNICA del catálogo de planes (tiers) y ciclos de cobro.
 *
 * Paquete puro TypeScript: CERO Next.js / Supabase / React / RN. Por eso la MISMA
 * lógica corre en web (Next) y en mobile (Expo) — mata el drift del espejo a mano que
 * antes vivía duplicado en apps/mobile/lib/coach-tiers.ts (ver plan 04, F6).
 *
 * Respeta capas (CLAUDE.md): domain/ y lib/ de web RE-EXPORTAN de acá (mismo patrón que
 * @eva/schemas / @eva/brand-kit). NO mover acá nada acoplado a un framework (iconos Lucide,
 * componentes, queries) — esos mapas de display siguen en su superficie.
 *
 * Plan 04 (consolidación de planes + ciclos):
 * - growth/scale fuera de venta, pero INTACTOS en runtime/DB/admin (grandfathered + placeholder
 *   team/org_managed, migración 20260609230000). NO borrar del union ni del catálogo.
 * - elite.maxClients = 100 (techo subido, bump regalado — F0-a).
 * - trimestral + anual habilitados en los 3 pagos (F0/D2).
 */

// ── Tipos de negocio ────────────────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'quarterly' | 'annual'

/** Union completo (CHECK de DB). growth/scale LEGACY pero vivos en runtime — NO borrar. */
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'

/** Tiers actualmente a la venta. Subconjunto de SubscriptionTier; growth/scale quedan fuera de venta (grandfathered). */
export type SaleTier = 'free' | 'starter' | 'pro' | 'elite'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    features: string[]
    isMostAffordable?: boolean
}

export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canUseAdvancedReports: boolean
    canCreateCustomExercises: boolean
    canImportClients: boolean
}

// ── Listas de venta / legacy ──────────────────────────────────────────────────

/** Tiers a la venta (orden de menor a mayor). Fuente única para selectores y recomendación. */
export const SALE_TIERS: readonly SaleTier[] = ['free', 'starter', 'pro', 'elite'] as const

/** Tiers fuera de venta, conservados en runtime/DB/admin para coaches grandfathered. */
export const LEGACY_TIERS = ['growth', 'scale'] as const

/** Type guard: ¿el tier (string arbitrario, ej. query param) es uno de los tiers a la venta? */
export function isSaleTier(tier: string): tier is SaleTier {
    return (SALE_TIERS as readonly string[]).includes(tier)
}

// ── Catálogo + display testeable ──────────────────────────────────────────────

const QUARTERLY_DISCOUNT = 0.1
const ANNUAL_DISCOUNT = 0.2
const SHARED_TIER_FEATURES = [
    'Rutinas ilimitadas con GIFs',
    'Catálogo de ejercicios con GIF',
    'Programas de entrenamiento',
    'Check-in y progreso',
    'Dashboard coach',
    'Branding personalizado',
] as const

/** Rango de alumnos por tier (copy marketing / UI). */
export const TIER_STUDENT_RANGE_LABEL: Record<SubscriptionTier, string> = {
    free: 'Hasta 3 alumnos',
    starter: '1–10 alumnos',
    pro: '11–30 alumnos',
    elite: '31–100 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: '61–120 alumnos',
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: 'Hasta 500 alumnos',
}

/** Etiqueta corta por tier (espejo único web + mobile). */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
    free: 'Gratis',
    starter: 'Starter',
    pro: 'Pro',
    elite: 'Elite',
    growth: 'Growth',
    scale: 'Scale',
}

export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
    free: {
        label: 'Free',
        maxClients: 3,
        monthlyPriceClp: 0,
        features: [
            'Rutinas ilimitadas con GIFs',
            'Catálogo de ejercicios con GIF',
            'Programas de entrenamiento',
            'Check-in y progreso',
            'Dashboard coach',
        ],
    },
    starter: {
        label: 'Starter',
        maxClients: 10,
        monthlyPriceClp: 19990,
        isMostAffordable: true,
        features: [...SHARED_TIER_FEATURES],
    },
    pro: {
        label: 'Pro',
        maxClients: 30,
        monthlyPriceClp: 29990,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
    elite: {
        label: 'Elite',
        maxClients: 100,
        monthlyPriceClp: 44990,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: {
        label: 'Growth',
        maxClients: 120,
        monthlyPriceClp: 84990,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: {
        label: 'Scale',
        maxClients: 500,
        monthlyPriceClp: 190000,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
}

/**
 * Feature gates by tier.
 * free/starter: no nutrition (upgrade driver). free: no branding (upgrade driver).
 * canUseAdvancedReports reserved for future implementation — gate not active yet.
 */
const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
    free: {
        canUseNutrition: false,
        canUseBranding: false,
        canUseAdvancedReports: false,
        canCreateCustomExercises: false,
        canImportClients: false,
    },
    starter: {
        canUseNutrition: false,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    pro: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    elite: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
        canCreateCustomExercises: true,
        canImportClients: true,
    },
}

// ── Helpers de precio / límites / capacidades ─────────────────────────────────

function applyDiscount(price: number, discount: number) {
    return Math.round(price * (1 - discount))
}

export function getTierPriceClp(tier: SubscriptionTier, cycle: BillingCycle) {
    const monthly = TIER_CONFIG[tier].monthlyPriceClp
    if (cycle === 'monthly') return monthly
    if (cycle === 'quarterly') return applyDiscount(monthly * 3, QUARTERLY_DISCOUNT)
    // anual = ×12 −20% para todo tier (la rama especial annualPriceClp de scale se eliminó — D3)
    return applyDiscount(monthly * 12, ANNUAL_DISCOUNT)
}

export function getTierMaxClients(tier: SubscriptionTier) {
    return TIER_CONFIG[tier].maxClients
}

export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
    return TIER_CAPABILITIES[tier]
}

// ── Ciclos de cobro ───────────────────────────────────────────────────────────

export const BILLING_CYCLE_CONFIG: Record<
    BillingCycle,
    { months: number; label: string; discountPercent: number }
> = {
    monthly: { months: 1, label: 'Mensual', discountPercent: 0 },
    quarterly: { months: 3, label: 'Trimestral', discountPercent: 10 },
    annual: { months: 12, label: 'Anual', discountPercent: 20 },
}

export const TIER_ALLOWED_BILLING_CYCLES: Record<SubscriptionTier, BillingCycle[]> = {
    free:    [],
    starter: ['monthly', 'quarterly', 'annual'],
    pro:     ['monthly', 'quarterly', 'annual'],
    elite:   ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    growth:  ['monthly', 'quarterly', 'annual'],
    // LEGACY — fuera de venta, grandfathered + placeholder team/org_managed (migracion 20260609230000). NO borrar.
    scale:   ['monthly', 'quarterly', 'annual'],
}

export function getTierAllowedBillingCycles(tier: SubscriptionTier): BillingCycle[] {
    return TIER_ALLOWED_BILLING_CYCLES[tier]
}

export function isBillingCycleAllowedForTier(
    tier: SubscriptionTier,
    cycle: BillingCycle
): boolean {
    return TIER_ALLOWED_BILLING_CYCLES[tier].includes(cycle)
}

// Free tier returns 'monthly' as placeholder — it has no billing cycle in practice
export function getDefaultBillingCycleForTier(tier: SubscriptionTier): BillingCycle {
    return TIER_ALLOWED_BILLING_CYCLES[tier][0] ?? 'monthly'
}

/** Texto corto para badges: cobro permitido por plan. */
export function getTierBillingCycleSummary(tier: SubscriptionTier): string {
    const cycles = TIER_ALLOWED_BILLING_CYCLES[tier]
    if (cycles.length === 0) return 'Plan gratuito'
    if (cycles.includes('monthly') && cycles.includes('quarterly') && cycles.includes('annual')) {
        return 'Cobro mensual, trimestral o anual'
    }
    // Genérica — solo alcanzable por tiers legacy con un subconjunto distinto de ciclos.
    return 'Solo cobro trimestral o anual'
}

/** Texto corto para badges: nutrición en el plan. */
export function getTierNutritionSummary(tier: SubscriptionTier): string {
    return getTierCapabilities(tier).canUseNutrition
        ? 'Incluye planes de nutrición'
        : 'Sin módulo de nutrición'
}

export function getRecommendedTier(clientCount: number): SubscriptionTier {
    // Solo recomendamos tiers a la venta. "Más de elite" lo maneja la UI con el puente Teams, no un tier.
    return SALE_TIERS.find(t => TIER_CONFIG[t].maxClients >= clientCount) ?? 'elite'
}

// ── Dirección del cambio de plan (upgrade/downgrade) ──────────────────────────
//
// Orden total de los tiers para decidir la dirección de un cambio de plan (plan
// estrategia 06 — comportamiento de cambio de plan decidido por el dueño). Cubre los
// 6 tiers (incluidos los LEGACY growth/scale) para que un coach grandfathered nunca
// produzca rank `undefined` al comparar contra un tier a la venta.

/** Orden total de tiers (precio/capacidad creciente). free < starter < pro < elite < growth < scale. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    elite: 3,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    growth: 4,
    // LEGACY — fuera de venta, grandfathered. Rango definido para no quedar undefined al comparar.
    scale: 5,
}

export function getTierRank(tier: SubscriptionTier): number {
    return TIER_RANK[tier]
}

/**
 * Dirección de un cambio de plan según el orden total de tiers:
 *   - `'upgrade'`   → el tier destino es mayor (rank next > current).
 *   - `'downgrade'` → el tier destino es menor (rank next < current).
 *   - `'same'`      → mismo tier (un cambio de ciclo se trata aparte por el llamador).
 */
export function comparePlanDirection(
    current: SubscriptionTier,
    next: SubscriptionTier
): 'upgrade' | 'downgrade' | 'same' {
    const c = getTierRank(current)
    const n = getTierRank(next)
    if (n > c) return 'upgrade'
    if (n < c) return 'downgrade'
    return 'same'
}
