import { supabase } from './supabase'
import { getCoachProfile, type CoachProfile } from './coach'
import { getCoachOrgContext } from './org'
// F6 (plan 04): TIER_LABELS vive en @eva/tiers (fuente única web+mobile). Re-export, no espejo a mano.
import { TIER_LABELS } from '@eva/tiers'

export interface AddonLive {
  moduleKey: string
  priceClp: number
  source: string
  status: string
  expiresAt: string | null
}

export interface PaymentEvent {
  id: string
  providerStatus: string | null
  provider: string | null
  createdAt: string
  amountClp: number | null
}

export interface BillingBreakdown {
  baseClp: number
  addonsClp: number
  totalClp: number
  discountClp: number | null
  couponCode: string | null
  chargedAt: string
}

export interface CardInfo {
  brand: string | null
  last4: string | null
}

export interface CoachSubscriptionOverview {
  profile: CoachProfile
  orgManaged: boolean
  orgName: string | null
  clientCount: number
  // Display parity con la web (solo lectura; pagos/cambios siguen web-only).
  card: CardInfo
  addons: AddonLive[]
  events: PaymentEvent[]
  billing: BillingBreakdown | null
}

/** Etiqueta legible de un modulo de pago (espejo de @eva/module-catalog; inline para no
 *  arrastrar el package a mobile). Las 4 keys son estables (MODULE_KEYS). */
export const MODULE_LABELS: Record<string, string> = {
  cardio: 'Cardio',
  movement_assessment: 'Screening de movimiento',
  body_composition: 'Composición corporal',
  nutrition_exchanges: 'Nutrición Pro',
}

/** Best-effort: extrae el monto CLP del payload de un subscription_event (MP). */
function extractEventAmountClp(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, any>
  const raw =
    p.transaction_amount ??
    p.auto_recurring?.transaction_amount ??
    p.amount ??
    p.data?.transaction_amount ??
    null
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null
}

export { TIER_LABELS }

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  canceled: 'Cancelada',
  expired: 'Vencida',
  past_due: 'Pago pendiente',
  pending_payment: 'Pago pendiente',
  paused: 'Pausada',
  org_managed: 'Gestionada por tu organización',
  team_managed: 'Gestionada por tu equipo',
}

export async function getCoachSubscriptionOverview(): Promise<CoachSubscriptionOverview | null> {
  const [profile, ctx] = await Promise.all([getCoachProfile(), getCoachOrgContext()])
  if (!profile) return null

  const { data: auth } = await supabase.auth.getUser()
  const coachId = auth.user?.id ?? null

  // Display parity reads — TODAS directas por PostgREST bajo la sesion del coach
  // (RLS SELECT-own). El endpoint web /api/payments/subscription-status usa sesion
  // por cookie y NO acepta el Bearer de mobile → leemos directo. Cada lectura es
  // tolerante a fallos: si una rompe, el resto de la pantalla sigue viva.
  const [count, card, addons, events, billing] = await Promise.all([
    // Active (non-archived) client count — RLS scopes to the coach's own clients.
    (async (): Promise<number> => {
      try {
        const r = await supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .or('is_archived.is.null,is_archived.eq.false')
        return r.count ?? 0
      } catch { return 0 }
    })(),
    // Tarjeta en archivo (brand + last4) — columnas propias del coach.
    (async (): Promise<CardInfo> => {
      try {
        if (!coachId) return { brand: null, last4: null }
        const r = await supabase.from('coaches').select('card_brand, card_last4').eq('id', coachId).maybeSingle()
        const row = r.data as any
        return { brand: row?.card_brand ?? null, last4: row?.card_last4 ?? null }
      } catch { return { brand: null, last4: null } }
    })(),
    // Add-ons vivos (active | cancel_pending).
    (async (): Promise<AddonLive[]> => {
      try {
        const r = await supabase
          .from('coach_addons')
          .select('module_key, price_clp, source, status, expires_at')
          .in('status', ['active', 'cancel_pending'])
        return ((r.data ?? []) as any[]).map((a) => ({
          moduleKey: a.module_key,
          priceClp: a.price_clp ?? 0,
          source: a.source ?? 'self_service',
          status: a.status ?? 'active',
          expiresAt: a.expires_at ?? null,
        }))
      } catch { return [] }
    })(),
    // Historial de pagos (subscription_events).
    (async (): Promise<PaymentEvent[]> => {
      try {
        const r = await supabase
          .from('subscription_events')
          .select('id, provider_status, provider, created_at, payload')
          .order('created_at', { ascending: false })
          .limit(20)
        return ((r.data ?? []) as any[]).map((e) => ({
          id: e.id,
          providerStatus: e.provider_status ?? null,
          provider: e.provider ?? null,
          createdAt: e.created_at,
          amountClp: extractEventAmountClp(e.payload),
        }))
      } catch { return [] }
    })(),
    // Ultimo snapshot de facturacion (total compuesto congelado — sin recomputar precios).
    (async (): Promise<BillingBreakdown | null> => {
      try {
        const r = await supabase
          .from('billing_snapshots')
          .select('base_clp, total_clp, discount_clp, coupon_code, charged_at')
          .order('charged_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const row = r.data as any
        if (!row) return null
        const base = row.base_clp ?? 0
        const total = row.total_clp ?? 0
        const discount = row.discount_clp ?? null
        return {
          baseClp: base,
          addonsClp: Math.max(0, total - base + (discount ?? 0)),
          totalClp: total,
          discountClp: discount,
          couponCode: row.coupon_code ?? null,
          chargedAt: row.charged_at,
        }
      } catch { return null }
    })(),
  ])

  return {
    profile,
    orgManaged: ctx.isOrgManaged,
    orgName: ctx.orgName,
    clientCount: count,
    card,
    addons,
    events,
    billing,
  }
}
