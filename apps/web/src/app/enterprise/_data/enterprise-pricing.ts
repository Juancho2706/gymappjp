// Source of truth: docs/ANALISIS_PRECIOS.md (Mayo 2026)
// Tiers B2B actualizados — NOT the old $49.990 base model

export type PricingBillingCycle = 'monthly' | 'annual'

export interface PricingFeature {
  text: string
  highlight?: boolean
}

export interface PricingTier {
  id: string
  name: string
  tagline: string
  coaches: string
  priceMonthly: number | null
  badge?: string
  badgeVariant?: 'popular' | 'custom'
  features: PricingFeature[]
  cta: string
  ctaVariant: 'primary' | 'ghost' | 'outline'
  ctaHref: string
  highlight: boolean
}

const CALENDLY = 'https://calendly.com/contacto-eva-app/eva-enterprise'
const ANNUAL_DISCOUNT = 0.2

export function getAnnualPrice(monthly: number): number {
  return Math.round(monthly * (1 - ANNUAL_DISCOUNT))
}

export function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter Gym',
    tagline: 'Para equipos que empiezan',
    coaches: 'Hasta 5 coaches',
    priceMonthly: 89990,
    features: [
      { text: 'Panel de administración centralizado' },
      { text: 'Hasta 5 coaches activos' },
      { text: 'Pool de alumnos compartido' },
      { text: 'Importación CSV de alumnos' },
      { text: 'Reportes de actividad básicos' },
      { text: 'Anuncios al equipo' },
      { text: 'White-label por coach incluido' },
      { text: 'Onboarding incluido' },
      { text: 'Soporte por WhatsApp y correo' },
    ],
    cta: 'Empezar prueba gratis',
    ctaVariant: 'outline',
    ctaHref: CALENDLY,
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro Gym',
    tagline: 'El más elegido por gyms activos',
    coaches: 'Hasta 10 coaches',
    priceMonthly: 159990,
    badge: 'Más popular',
    badgeVariant: 'popular',
    features: [
      { text: 'Todo lo de Starter Gym' },
      { text: 'Hasta 10 coaches activos', highlight: true },
      { text: 'Health score por coach' },
      { text: 'Alertas automáticas de inactividad' },
      { text: 'Templates de nutrición compartidos' },
      { text: 'Export PDF de reportes' },
      { text: 'MFA obligatorio para admins' },
      { text: 'Audit log de acciones' },
      { text: 'SLA 99.5% mensual' },
    ],
    cta: 'Empezar prueba gratis',
    ctaVariant: 'primary',
    ctaHref: CALENDLY,
    highlight: true,
  },
  {
    id: 'elite',
    name: 'Elite Gym',
    tagline: 'Para organizaciones grandes',
    coaches: 'Hasta 20 coaches',
    priceMonthly: 269990,
    features: [
      { text: 'Todo lo de Pro Gym' },
      { text: 'Hasta 20 coaches activos', highlight: true },
      { text: 'Branding personalizado por org' },
      { text: 'Asignación avanzada de alumnos' },
      { text: 'Roles granulares (admin / org_owner)' },
      { text: 'Reportes avanzados y exportación' },
      { text: 'Contrato enterprise con SLA' },
      { text: 'DPA Ley 21.719 (datos personales)' },
      { text: 'Soporte prioritario' },
    ],
    cta: 'Empezar prueba gratis',
    ctaVariant: 'outline',
    ctaHref: CALENDLY,
    highlight: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para cadenas y federaciones',
    coaches: '21+ coaches',
    priceMonthly: null,
    badge: 'Custom',
    badgeVariant: 'custom',
    features: [
      { text: 'Todo lo de Elite Gym' },
      { text: 'Coaches ilimitados', highlight: true },
      { text: 'Infraestructura dedicada (opcional)' },
      { text: 'Integraciones custom via API' },
      { text: 'SLA personalizado' },
      { text: 'Account manager dedicado' },
      { text: 'Onboarding presencial (Santiago)' },
      { text: 'Precio negociado según volumen' },
      { text: 'Desde $400.000 CLP/mes' },
    ],
    cta: 'Contactar ventas',
    ctaVariant: 'ghost',
    ctaHref: CALENDLY,
    highlight: false,
  },
]

// ROI calculator: individual vs plan
export const INDIVIDUAL_PRICE = 29990

const COACH_LIMITS: Record<string, number | null> = {
  starter: 5,
  pro: 10,
  elite: 20,
  enterprise: null,
}

export function calcROI(numCoaches: number): {
  individualTotal: number
  bestPlan: PricingTier | null
  savings: number
  annualSavings: number
} {
  const individualTotal = numCoaches * INDIVIDUAL_PRICE

  const applicable = PRICING_TIERS.filter(t => {
    if (t.id === 'enterprise') return numCoaches >= 21
    if (t.id === 'starter') return numCoaches <= 5
    if (t.id === 'pro') return numCoaches <= 10
    if (t.id === 'elite') return numCoaches <= 20
    return false
  })

  const bestPlan = applicable[applicable.length - 1] ?? null
  const planPrice = bestPlan?.priceMonthly ?? 0
  const savings = Math.max(0, individualTotal - planPrice)
  return {
    individualTotal,
    bestPlan,
    savings,
    annualSavings: savings * 12,
  }
}

export interface PlanROI {
  tier: PricingTier
  applicable: boolean
  planPrice: number
  savings: number
  annualSavings: number
  isBest: boolean
}

export function calcROIAllPlans(numCoaches: number): {
  individualTotal: number
  plans: PlanROI[]
} {
  const individualTotal = numCoaches * INDIVIDUAL_PRICE

  const plans: Omit<PlanROI, 'isBest'>[] = PRICING_TIERS.map(tier => {
    const limit = COACH_LIMITS[tier.id]
    const applicable = limit === null ? numCoaches >= 21 : numCoaches <= limit
    const planPrice = tier.priceMonthly ?? 400000
    const savings = individualTotal - planPrice
    return { tier, applicable, planPrice, savings, annualSavings: savings * 12 }
  })

  const best = plans
    .filter(p => p.applicable && p.savings > 0)
    .sort((a, b) => b.savings - a.savings)[0] ?? null

  return {
    individualTotal,
    plans: plans.map(p => ({ ...p, isBest: p === best })),
  }
}
