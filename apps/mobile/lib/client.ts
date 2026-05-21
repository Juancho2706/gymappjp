import { supabase } from './supabase'

export interface ClientProfile {
  id: string
  userId: string
  fullName: string
  coachId: string
  orgId: string | null
}

export async function getClientProfile(): Promise<ClientProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('clients')
    .select('id, full_name, coach_id, org_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    userId: user.id,
    fullName: data.full_name,
    coachId: data.coach_id,
    orgId: data.org_id ?? null,
  }
}
