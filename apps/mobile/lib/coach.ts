import { supabase } from './supabase'
import { isBrandingAllowed, parseSubscriptionTier } from '@eva/tiers'

// Contrato de color del panel coach cuando el branding white-label no está incluido.
// Pricing v3 (owner 2026-08-21): el white-label está en todos los planes vendidos (free incluido),
// así que esta rama es hoy el fail-closed de `isBrandingAllowed` — tier inválido o legacy starter.
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
  /**
   * `coaches.created_at` — ancla del grandfather de pricing: los límites por tier de este coach se
   * resuelven con `tierMaxClientsFor(tier, createdAt)`, que hoy tiene TRES peldaños (pre-v2: free 3
   * · v2: free 2 · v3, desde 2026-08-21: free 1). El grandfather es por FECHA DE ALTA, no por uso.
   */
  createdAt: string | null
  hasCoachLogo?: boolean
  logoUrl?: string | null
}

const COACH_PROFILE_COLUMNS =
  'id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients, created_at'

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

/**
 * Señal del banner de verificación (FCN W3.11): `verified` / `unverified` / `unknown`.
 * `unknown` = no se pudo preguntar (sin red, RLS, columna fuera del schema cache).
 */
export type CoachEmailVerification = 'verified' | 'unverified' | 'unknown'

/**
 * ¿El coach probó su casilla? (`coaches.email_verified_at`).
 *
 * Consulta APARTE y no una columna más de `COACH_PROFILE_COLUMNS` por dos razones:
 *  - El camino FELIZ del dashboard no arma el coach con este módulo sino con la respuesta de
 *    `/api/mobile/coach/dashboard` (`lib/coach-dashboard.ts`), que no sirve este campo: sumarlo al
 *    perfil daría `undefined` justo donde el banner tiene que decidir.
 *  - Un `select` con una columna que el schema cache todavía no conoce falla ENTERO. Ese fallo
 *    tumbaría el perfil que usan los GATES de acceso; acá, aislado, solo apaga un banner.
 *
 * FAIL-CLOSED AL SILENCIO (mismo criterio que la web): cualquier duda devuelve `unknown` y el
 * banner NO se pinta. Molestar con «verifica tu correo» a quien ya lo verificó es peor que no
 * avisarle a quien no.
 *
 * La lectura va con el JWT del coach: la columna tiene GRANT SELECT para `authenticated` y la
 * policy `coaches_select_own` la acota a su propia fila.
 */
export async function getCoachEmailVerification(): Promise<CoachEmailVerification> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'unknown'

    const { data, error } = await supabase
      .from('coaches')
      .select('email_verified_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) return 'unknown'
    return (data as { email_verified_at: string | null }).email_verified_at == null
      ? 'unverified'
      : 'verified'
  } catch {
    return 'unknown'
  }
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
  created_at?: string | null
}

function mapCoachRow(data: CoachRow): CoachProfile {
  const subscriptionTier = parseSubscriptionTier(data.subscription_tier)
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
    createdAt: data.created_at ?? null,
    hasCoachLogo: brandingAllowed && Boolean(data.logo_url?.trim()),
    logoUrl: brandingAllowed ? data.logo_url ?? null : null,
  }
}
