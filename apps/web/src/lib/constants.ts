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

// ── Tiers / ciclos: fuente única en @eva/tiers (paquete puro, compartido web+mobile — plan 04 F6).
// lib/constants RE-EXPORTA del paquete: los call sites (import desde '@/lib/constants') NO cambian.
// Mismo patrón que packages/schemas / packages/brand-kit. Cero lógica nueva acá — solo re-export.
export type {
    BillingCycle,
    SubscriptionTier,
    SaleTier,
    TierConfig,
    TierCapabilities,
} from '@eva/tiers'
// SubscriptionStatus / PaymentProvider viven en domain (no son del catálogo de tiers).
export type { PaymentProvider, SubscriptionStatus } from '@/domain/coach/types'

export {
    SALE_TIERS,
    LEGACY_TIERS,
    isSaleTier,
    TIER_STUDENT_RANGE_LABEL,
    TIER_LABELS,
    TIER_CONFIG,
    getTierPriceClp,
    getTierMaxClients,
    getTierCapabilities,
    BILLING_CYCLE_CONFIG,
    TIER_ALLOWED_BILLING_CYCLES,
    getTierAllowedBillingCycles,
    isBillingCycleAllowedForTier,
    getDefaultBillingCycleForTier,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getRecommendedTier,
} from '@eva/tiers'


// Note: 'canceled' is NOT in this list. A canceled coach still has access until
// current_period_end. The gate in coach-subscription-gate.ts handles that date check.
// 'org_managed' is NOT in this list — org coaches always have access (plan managed by org).
export const SUBSCRIPTION_BLOCKED_STATUSES = [
    'pending_payment',
    'expired',
    'past_due',
    'paused',
] as const
