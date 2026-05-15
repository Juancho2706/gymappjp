export const MUSCLE_GROUPS = [
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Antebrazos',
    'Cuádriceps',
    'Glúteos',
    'Abductores',
    'Aductores',
    'Pantorrillas',
    'Lumbar',
    'Abdominales',
    'Cardio',
    'Dorsales',
    'Espalda Alta',
    'Isquiotibiales',
    'Pectorales',
    'Trapecios'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];

export const MUSCLE_MAPPING: Record<string, string[]> = {
    'hombros': ['delts', 'shoulders', 'deltoides'],
    'biceps': ['biceps', 'bíceps'],
    'triceps': ['triceps', 'tríceps'],
    'antebrazos': ['forearms', 'antebrazos'],
    'cuadriceps': ['quads', 'cuadriceps', 'cuádriceps'],
    'gluteos': ['glutes', 'glúteos'],
    'abductores': ['abductors', 'abductores'],
    'aductores': ['adductors', 'aductores'],
    'pantorrillas': ['calves', 'pantorrillas', 'gemelos'],
    'lumbar': ['lower back', 'lumbar'],
    'abdominales': ['abs', 'core', 'abdominales', 'abdomen'],
    'cardio': ['cardio', 'cardiovascular system'],
    'dorsales': ['lats', 'dorsales'],
    'espalda alta': ['upper back', 'espalda alta'],
    'isquiotibiales': ['hamstrings', 'isquiotibiales', 'isquios'],
    'pectorales': ['pectoral', 'pecho', 'chest', 'pectorales'],
    'trapecios': ['traps', 'trapecios', 'trapecio']
};

export type BillingCycle = 'monthly' | 'quarterly' | 'annual'
export type PaymentProvider = 'mercadopago' | 'stripe' | 'admin'
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    annualPriceClp?: number
    features: string[]
    isMostAffordable?: boolean
}

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
    elite: '31–60 alumnos',
    growth: '61–120 alumnos',
    scale: 'Hasta 500 alumnos',
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
        maxClients: 60,
        monthlyPriceClp: 44990,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
    growth: {
        label: 'Growth',
        maxClients: 120,
        monthlyPriceClp: 84990,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
    scale: {
        label: 'Scale',
        maxClients: 500,
        monthlyPriceClp: 190000,
        annualPriceClp: 1_900_000,
        features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
    },
}

/**
 * Feature gates by tier.
 * free/starter: no nutrition (upgrade driver). free: no branding (upgrade driver).
 * canUseAdvancedReports reserved for future implementation — gate not active yet.
 */
export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canUseAdvancedReports: boolean
}

const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
    free: {
        canUseNutrition: false,
        canUseBranding: false,
        canUseAdvancedReports: false,
    },
    starter: {
        canUseNutrition: false,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
    pro: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
    elite: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
    growth: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
    scale: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
}

function applyDiscount(price: number, discount: number) {
    return Math.round(price * (1 - discount))
}

export function getTierPriceClp(tier: SubscriptionTier, cycle: BillingCycle) {
    const config = TIER_CONFIG[tier]
    const monthly = config.monthlyPriceClp
    if (cycle === 'monthly') return monthly
    if (cycle === 'quarterly') return applyDiscount(monthly * 3, QUARTERLY_DISCOUNT)
    if (config.annualPriceClp) return config.annualPriceClp
    return applyDiscount(monthly * 12, ANNUAL_DISCOUNT)
}

export function getTierMaxClients(tier: SubscriptionTier) {
    return TIER_CONFIG[tier].maxClients
}

export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
    return TIER_CAPABILITIES[tier]
}

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
    starter: ['monthly', 'annual'],
    pro:     ['monthly', 'annual'],
    elite:   ['monthly', 'quarterly', 'annual'],
    growth:  ['monthly', 'quarterly', 'annual'],
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
    if (cycles.length === 1 && cycles[0] === 'monthly') return 'Solo cobro mensual'
    if (cycles.includes('monthly') && cycles.includes('annual') && !cycles.includes('quarterly')) {
        return 'Cobro mensual o anual'
    }
    if (cycles.includes('monthly') && cycles.includes('quarterly') && cycles.includes('annual')) {
        return 'Cobro mensual, trimestral o anual'
    }
    return 'Solo cobro trimestral o anual'
}

/** Texto corto para badges: nutrición en el plan. */
export function getTierNutritionSummary(tier: SubscriptionTier): string {
    return getTierCapabilities(tier).canUseNutrition
        ? 'Incluye planes de nutrición'
        : 'Sin módulo de nutrición'
}

export function getRecommendedTier(clientCount: number): SubscriptionTier {
    const ordered: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']
    return ordered.find(t => TIER_CONFIG[t].maxClients >= clientCount) ?? 'scale'
}

// Note: 'canceled' is NOT in this list. A canceled coach still has access until
// current_period_end. The gate in coach-subscription-gate.ts handles that date check.
export const SUBSCRIPTION_BLOCKED_STATUSES = [
    'pending_payment',
    'expired',
    'past_due',
    'paused',
] as const
