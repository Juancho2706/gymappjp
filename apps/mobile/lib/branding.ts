import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export interface CoachBranding {
  coachId: string
  coachSlug: string
  primaryColor: string
  displayName: string
  inviteCode: string
  // Mensaje de bienvenida del coach (subtítulo del login del alumno). Opcional (DB-compat / grant anon).
  welcomeMessage?: string | null
  // M-F1: loader personalizado del coach (lo consume EvaLoader). Opcionales por DB-compat.
  logoUrl?: string | null
  useCustomLoader?: boolean
  loaderText?: string | null
  loaderIconMode?: 'eva' | 'coach' | 'none' | string | null
  loaderTextColor?: string | null
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

const BRANDING_COLS_RICH =
  'id, slug, primary_color, display_name, invite_code, welcome_message, logo_url, use_custom_loader, loader_text, loader_icon_mode, loader_text_color'
const BRANDING_COLS_MIN = 'id, slug, primary_color, display_name, invite_code'

export async function fetchBrandingByCoachIdentifier(identifierInput: string): Promise<CoachBranding | null> {
  const identifier = normalizeCoachIdentifier(identifierInput)
  const runQuery = (cols: string) => {
    const q = supabase.from('coaches').select(cols)
    return INVITE_CODE_RE.test(identifier)
      ? q.eq('invite_code', identifier).maybeSingle()
      : SLUG_RE.test(identifier)
        ? q.eq('slug', identifier).maybeSingle()
        : q.eq('invite_code', '__invalid__').maybeSingle()
  }

  // M-F1: intenta columnas de loader; si la DB no las tiene, cae a las mínimas.
  let res = (await runQuery(BRANDING_COLS_RICH)) as { data: any; error: any }
  if (res.error) res = (await runQuery(BRANDING_COLS_MIN)) as { data: any; error: any }
  const data = res.data
  if (res.error || !data) return null

  const branding: CoachBranding = {
    coachId: data.id,
    coachSlug: data.slug,
    primaryColor: data.primary_color ?? '#007AFF',
    displayName: data.display_name ?? data.slug,
    inviteCode: data.invite_code,
    welcomeMessage: data.welcome_message ?? null,
    logoUrl: data.logo_url ?? null,
    useCustomLoader: data.use_custom_loader ?? false,
    loaderText: data.loader_text ?? null,
    loaderIconMode: data.loader_icon_mode ?? null,
    loaderTextColor: data.loader_text_color ?? null,
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
