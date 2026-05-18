import { supabase } from './supabase'

export interface CoachProfile {
  id: string
  fullName: string
  brandName: string
  slug: string
  primaryColor: string
  subscriptionStatus: string
  maxClients: number
}

export async function getCoachProfile(): Promise<CoachProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name, slug, primary_color, subscription_status, max_clients')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    fullName: data.full_name,
    brandName: data.brand_name,
    slug: data.slug,
    primaryColor: data.primary_color,
    subscriptionStatus: data.subscription_status,
    maxClients: data.max_clients,
  }
}
