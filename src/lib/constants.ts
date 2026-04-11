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
export type PaymentProvider = 'mercadopago' | 'stripe'
export type SubscriptionTier =
    | 'starter_lite'
    | 'starter'
    | 'pro'
    | 'elite'
    | 'scale'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    features: string[]
    isMostAffordable?: boolean
}

const QUARTERLY_DISCOUNT = 0.1
const ANNUAL_DISCOUNT = 0.2
const SHARED_TIER_FEATURES = [
    'Rutinas y ejercicios',
    'Programas de entrenamiento',
    'Check-in y progreso',
    'Dashboard coach',
    'Nutrición',
    'Branding personalizado',
] as const

export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
    starter_lite: {
        label: 'Starter Lite',
        maxClients: 5,
        monthlyPriceClp: 7990,
        isMostAffordable: true,
        features: [...SHARED_TIER_FEATURES],
    },
    starter: {
        label: 'Starter',
        maxClients: 10,
        monthlyPriceClp: 14990,
        features: [...SHARED_TIER_FEATURES],
    },
    pro: {
        label: 'Pro',
        maxClients: 25,
        monthlyPriceClp: 24990,
        features: [...SHARED_TIER_FEATURES],
    },
    elite: {
        label: 'Elite',
        maxClients: 50,
        monthlyPriceClp: 39990,
        features: [...SHARED_TIER_FEATURES],
    },
    scale: {
        label: 'Scale',
        maxClients: 100,
        monthlyPriceClp: 59990,
        features: [...SHARED_TIER_FEATURES],
    },
}

/**
 * Feature gates by tier. Product policy (2026): paid tiers differ mainly by `maxClients` in {@link TIER_CONFIG};
 * marketing lists the same core features for all. Keeping all capabilities `true` avoids fake paywalls and matches
 * that policy. Use `max_clients` / subscription UI for upsell on capacity, not branding/nutrition locks.
 */
export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canUseAdvancedReports: boolean
}

const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
    starter_lite: {
        canUseNutrition: true,
        canUseBranding: true,
        canUseAdvancedReports: true,
    },
    starter: {
        canUseNutrition: true,
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
    const monthly = TIER_CONFIG[tier].monthlyPriceClp
    if (cycle === 'monthly') return monthly
    if (cycle === 'quarterly') return applyDiscount(monthly * 3, QUARTERLY_DISCOUNT)
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

export const SUBSCRIPTION_BLOCKED_STATUSES = [
    'pending_payment',
    'expired',
    'canceled',
    'past_due',
    'paused',
] as const
