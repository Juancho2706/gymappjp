import { supabase } from './supabase'

export interface CoachProfile {
  id: string
  fullName: string
  brandName: string
  slug: string
  inviteCode: string | null
  primaryColor: string
  subscriptionStatus: string
  subscriptionTier: 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  maxClients: number
  hasCoachLogo?: boolean
  logoUrl?: string | null
}

function normalizeSubscriptionTier(raw: string | null | undefined): CoachProfile['subscriptionTier'] {
  const v = String(raw ?? 'starter').toLowerCase()
  if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
  return 'starter'
}

export async function getCoachProfile(): Promise<CoachProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    fullName: data.full_name,
    brandName: data.brand_name,
    slug: data.slug,
    inviteCode: (data as { invite_code?: string | null }).invite_code ?? null,
    primaryColor: data.primary_color,
    subscriptionStatus: data.subscription_status,
    subscriptionTier: normalizeSubscriptionTier(data.subscription_tier),
    currentPeriodEnd: data.current_period_end,
    trialEndsAt: data.trial_ends_at,
    maxClients: data.max_clients,
    hasCoachLogo: Boolean(data.logo_url?.trim()),
    logoUrl: data.logo_url ?? null,
  }
}
