import type { CoachProfile } from './coach'

export type SubscriptionTier = CoachProfile['subscriptionTier']

export const TIER_CONFIG: Record<SubscriptionTier, { label: string; maxClients: number }> = {
  free: { label: 'Free', maxClients: 3 },
  starter: { label: 'Starter', maxClients: 10 },
  pro: { label: 'Pro', maxClients: 30 },
  elite: { label: 'Elite', maxClients: 60 },
  growth: { label: 'Growth', maxClients: 120 },
  scale: { label: 'Scale', maxClients: 500 },
}

export function getRecommendedTier(clientCount: number): SubscriptionTier {
  const ordered: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']
  return ordered.find((tier) => TIER_CONFIG[tier].maxClients >= clientCount) ?? 'scale'
}

// TX-7: capabilities 1:1 con web (lib/constants.TIER_CAPABILITIES). free = sin nada premium;
// starter+ = branding + ejercicios custom + import; pro+ = nutrición.
export interface TierCapabilities {
  canUseNutrition: boolean
  canUseBranding: boolean
  canCreateCustomExercises: boolean
  canImportClients: boolean
  canUseAdvancedReports: boolean
}

const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
  free: { canUseNutrition: false, canUseBranding: false, canCreateCustomExercises: false, canImportClients: false, canUseAdvancedReports: false },
  starter: { canUseNutrition: false, canUseBranding: true, canCreateCustomExercises: true, canImportClients: true, canUseAdvancedReports: true },
  pro: { canUseNutrition: true, canUseBranding: true, canCreateCustomExercises: true, canImportClients: true, canUseAdvancedReports: true },
  elite: { canUseNutrition: true, canUseBranding: true, canCreateCustomExercises: true, canImportClients: true, canUseAdvancedReports: true },
  growth: { canUseNutrition: true, canUseBranding: true, canCreateCustomExercises: true, canImportClients: true, canUseAdvancedReports: true },
  scale: { canUseNutrition: true, canUseBranding: true, canCreateCustomExercises: true, canImportClients: true, canUseAdvancedReports: true },
}

export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
  return TIER_CAPABILITIES[tier] ?? TIER_CAPABILITIES.free
}

export function canUseNutrition(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canUseNutrition
}
export function canUseBranding(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canUseBranding
}
export function canCreateCustomExercises(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canCreateCustomExercises
}
export function canImportClients(tier: SubscriptionTier): boolean {
  return getTierCapabilities(tier).canImportClients
}
