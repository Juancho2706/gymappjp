import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export interface CoachBranding {
  coachId: string
  coachSlug: string
  primaryColor: string
  /** Nombre visible de la marca (`coaches.brand_name`). */
  displayName: string
  inviteCode: string
  logoUrl?: string | null
  // E1-14 — payload white-label del login del alumno (espejo de `getClientLoginCoach` en web:
  // apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts). Columnas con GRANT SELECT a
  // `anon` verificado (auditoria E0-B1) — el login es pre-auth y lee como `anon`. Opcionales por
  // DB-compat (fallback a las columnas minimas si una falta en una DB vieja).
  /** Logo alternativo para modo oscuro (`logo_url_dark`). */
  logoUrlDark?: string | null
  /** Tagline del hero de login (`welcome_message`). */
  welcomeMessage?: string | null
  /** Tier de suscripcion — gatea el branding (isBrandingAllowed: < Pro => EVA). */
  subscriptionTier?: string | null
  /** Variante de layout del login: clasico | hero | energia | minimal (`login_layout_key`). */
  loginLayoutKey?: string | null
  /** Color secundario (color2) white-label v2 (`brand_secondary_color`). */
  brandSecondaryColor?: string | null
  /** Override de acento por modo claro (`accent_light`). */
  accentLight?: string | null
  /** Override de acento por modo oscuro (`accent_dark`). */
  accentDark?: string | null
  /** Tiñe neutrales con el hue de marca (`neutral_tint`). */
  neutralTint?: boolean | null
  /** Fuente de display curada (`brand_font_key`). */
  brandFontKey?: string | null
  /** Tema preset curado — su precedencia se resuelve con `resolvePresetBranding` (`theme_preset_key`). */
  themePresetKey?: string | null
  /** Variante de loader sugerida (`loader_variant`). */
  loaderVariant?: string | null
  /** Config cruda del compositor de loader (`loader_config`, jsonb → string JSON). */
  loaderConfig?: string | null
  // M-F1: loader personalizado del coach (lo consume EvaLoader). Opcionales por DB-compat.
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

// Nota: `display_name` NO es columna de `coaches` (fuente de verdad = `brand_name`, alineado con la
// query del login web). El select rich pide todo el payload white-label del login; el min es el
// fallback DB-compat para DBs viejas que no tengan las columnas v2 (todas con GRANT anon).
const BRANDING_COLS_RICH =
  'id, slug, primary_color, brand_name, invite_code, logo_url, logo_url_dark, welcome_message, subscription_tier, login_layout_key, brand_secondary_color, accent_light, accent_dark, neutral_tint, brand_font_key, theme_preset_key, loader_variant, loader_config, use_custom_loader, loader_text, loader_icon_mode, loader_text_color'
const BRANDING_COLS_MIN = 'id, slug, primary_color, brand_name, invite_code'

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

  const rawLoaderConfig = data.loader_config
  const branding: CoachBranding = {
    coachId: data.id,
    coachSlug: data.slug,
    primaryColor: data.primary_color ?? '#007AFF',
    displayName: data.brand_name ?? data.slug,
    inviteCode: data.invite_code,
    logoUrl: data.logo_url ?? null,
    logoUrlDark: data.logo_url_dark ?? null,
    welcomeMessage: data.welcome_message ?? null,
    subscriptionTier: data.subscription_tier ?? null,
    loginLayoutKey: data.login_layout_key ?? null,
    brandSecondaryColor: data.brand_secondary_color ?? null,
    accentLight: data.accent_light ?? null,
    accentDark: data.accent_dark ?? null,
    neutralTint: data.neutral_tint ?? null,
    brandFontKey: data.brand_font_key ?? null,
    themePresetKey: data.theme_preset_key ?? null,
    loaderVariant: data.loader_variant ?? null,
    loaderConfig:
      typeof rawLoaderConfig === 'string'
        ? rawLoaderConfig
        : rawLoaderConfig
          ? JSON.stringify(rawLoaderConfig)
          : null,
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
