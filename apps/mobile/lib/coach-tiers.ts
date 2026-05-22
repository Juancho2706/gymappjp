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
