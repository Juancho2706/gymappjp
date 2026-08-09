import { supabase } from './supabase'
import { isBrandingAllowed } from '@eva/tiers'

// Contrato de color del panel coach cuando el branding white-label no está incluido.
const SYSTEM_PRIMARY_COLOR = '#007AFF'
// F6 (plan 04): el union de tiers vive en @eva/tiers (fuente única web+mobile). NO redeclarar acá.
import type { SubscriptionTier } from '@eva/tiers'

export interface CoachProfile {
  id: string
  fullName: string
  brandName: string
  slug: string
  inviteCode: string | null
  primaryColor: string
  subscriptionStatus: string
  // LEGACY: 'growth'/'scale' fuera de venta (plan 04) pero SE MANTIENEN en el union (@eva/tiers) —
  // parsean el valor crudo de DB de cuentas grandfathered + placeholders team/org_managed. NO borrar.
  subscriptionTier: SubscriptionTier
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  maxClients: number
  hasCoachLogo?: boolean
  logoUrl?: string | null
}

function normalizeSubscriptionTier(raw: string | null | undefined): CoachProfile['subscriptionTier'] {
  const v = String(raw ?? 'starter').toLowerCase()
  // LEGACY: reconoce los 6 valores del CHECK de DB (incluye growth/scale) para no degradar
  // cuentas grandfathered a 'starter'. Fuera de venta, pero vivas en runtime (plan 04).
  if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
  return 'starter'
}

const COACH_PROFILE_COLUMNS =
  'id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients'

/**
 * Variante ESTRICTA para GATES (coach-access): distingue "no hay fila de coach" (=> `null`, estado
 * neutro legitimo: el usuario es alumno) de "no pude preguntar" (=> LANZA: offline/5xx/RLS).
 *
 * `getCoachProfile()` colapsa ambos casos en `null` y eso deja fail-OPEN a cualquier consumidor que
 * use la ausencia de perfil como veredicto (auditoria 2026-08-09): en modo avion un coach vencido
 * pasaba por "alumno" y el arbol coach se renderizaba entero.
 */
export async function getCoachProfileStrict(): Promise<CoachProfile | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  // Sin sesion, supabase-js devuelve error + user null; ahi NO hay nada que preguntar (neutro).
  // Cualquier otro error de auth (red caida, 5xx del GoTrue) es "no pude preguntar" => lanza.
  if (authError && (user || (authError as { name?: string }).name !== 'AuthSessionMissingError')) throw authError
  if (!user) return null

  const { data, error } = await supabase
    .from('coaches')
    .select(COACH_PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  return data ? mapCoachRow(data) : null
}

export async function getCoachProfile(): Promise<CoachProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('coaches')
    .select(COACH_PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return mapCoachRow(data)
}

type CoachRow = {
  id: string
  full_name: string
  brand_name: string
  slug: string
  invite_code?: string | null
  primary_color: string
  logo_url: string | null
  subscription_status: string
  subscription_tier: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  max_clients: number
}

function mapCoachRow(data: CoachRow): CoachProfile {
  const subscriptionTier = normalizeSubscriptionTier(data.subscription_tier)
  const brandingAllowed = isBrandingAllowed(subscriptionTier)
  return {
    id: data.id,
    fullName: data.full_name,
    brandName: data.brand_name,
    slug: data.slug,
    inviteCode: (data as { invite_code?: string | null }).invite_code ?? null,
    // El valor personalizado sigue guardado en `coaches`; el perfil de runtime expone
    // solamente la presentación efectiva para evitar fugas en pantallas que no usan ThemeContext.
    primaryColor: brandingAllowed ? data.primary_color : SYSTEM_PRIMARY_COLOR,
    subscriptionStatus: data.subscription_status,
    subscriptionTier,
    currentPeriodEnd: data.current_period_end,
    trialEndsAt: data.trial_ends_at,
    maxClients: data.max_clients,
    hasCoachLogo: brandingAllowed && Boolean(data.logo_url?.trim()),
    logoUrl: brandingAllowed ? data.logo_url ?? null : null,
  }
}
