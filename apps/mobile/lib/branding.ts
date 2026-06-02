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
const INVITE_CODE_RE = /^[A-Z2-9]{5}$/
const SLUG_RE = /^[a-z0-9-]{3,50}$/

export function normalizeCoachIdentifier(input: string): string {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/\/c\/([^/?#]+)/i)?.[1]
  const raw = decodeURIComponent(fromUrl ?? trimmed)
    .replace(/^https?:\/\//i, '')
    .replace(/^eva-app\.cl\/c\//i, '')
    .replace(/\/(login|dashboard|nutrition|check-in|workout.*)?$/i, '')
    .trim()

  return INVITE_CODE_RE.test(raw.toUpperCase())
    ? raw.toUpperCase()
    : raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

export async function fetchBrandingByCoachIdentifier(identifierInput: string): Promise<CoachBranding | null> {
  const identifier = normalizeCoachIdentifier(identifierInput)
  const query = supabase
    .from('coaches')
    .select('id, slug, primary_color, display_name, invite_code')

  const { data, error } = await (
    INVITE_CODE_RE.test(identifier)
      ? query.eq('invite_code', identifier).maybeSingle()
      : SLUG_RE.test(identifier)
        ? query.eq('slug', identifier).maybeSingle()
        : query.eq('invite_code', '__invalid__').maybeSingle()
  )

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

export async function fetchBrandingByInviteCode(inviteCode: string): Promise<CoachBranding | null> {
  return fetchBrandingByCoachIdentifier(inviteCode)
}

export async function saveStoredBranding(branding: CoachBranding): Promise<void> {
  await AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(branding))
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
