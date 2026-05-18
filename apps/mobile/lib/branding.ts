import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export interface CoachBranding {
  coachId: string
  coachSlug: string
  primaryColor: string
  displayName: string
  inviteCode: string
}

const BRANDING_KEY = 'eva_coach_branding'

export async function fetchBrandingByInviteCode(inviteCode: string): Promise<CoachBranding | null> {
  const { data, error } = await supabase
    .from('coaches')
    .select('id, slug, primary_color, display_name, invite_code')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (error || !data) return null

  const branding: CoachBranding = {
    coachId: data.id,
    coachSlug: data.slug,
    primaryColor: data.primary_color ?? '#007AFF',
    displayName: data.display_name ?? data.slug,
    inviteCode: data.invite_code,
  }

  await AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(branding))
  return branding
}

export async function loadStoredBranding(): Promise<CoachBranding | null> {
  const raw = await AsyncStorage.getItem(BRANDING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CoachBranding
  } catch {
    return null
  }
}

export async function clearBranding(): Promise<void> {
  await AsyncStorage.removeItem(BRANDING_KEY)
}
