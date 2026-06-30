// Mapas PUROS de display por tier (icono / clases de color / badge), extraídos VERBATIM de
// page.tsx (Fase 2 — split de god-file, behavior-preserving). Solo data + identidad de iconos;
// la UI nunca calcula precios. Sin JSX (referencias de valor) → .ts.

import type { LucideIcon } from 'lucide-react'
import { Zap, Crown, Rocket, TrendingUp, Building2, Leaf } from 'lucide-react'
import type { SubscriptionTier } from '@/lib/constants'

// growth/scale: LEGACY (fuera de venta). Se mantienen en los mapas de display porque el PLAN
// ACTUAL de un coach grandfathered puede ser legacy y debe renderizar su icono/color correcto.
export const TIER_ICON: Record<SubscriptionTier, LucideIcon> = {
    free: Leaf, starter: Zap, pro: Rocket, elite: Crown, growth: TrendingUp, scale: Building2,
}
export const TIER_COLOR: Record<SubscriptionTier, string> = {
    free: 'text-slate-400', starter: 'text-sky-400', pro: 'text-violet-400',
    elite: 'text-amber-400', growth: 'text-emerald-400', scale: 'text-rose-400',
}
export const TIER_ICON_BG: Record<SubscriptionTier, string> = {
    free: 'bg-slate-500/10 border-slate-500/20', starter: 'bg-sky-500/10 border-sky-500/20',
    pro: 'bg-violet-500/10 border-violet-500/20', elite: 'bg-amber-500/10 border-amber-500/20',
    growth: 'bg-emerald-500/10 border-emerald-500/20', scale: 'bg-rose-500/10 border-rose-500/20',
}
export const TIER_BADGE: Partial<Record<SubscriptionTier, { label: string; cls: string }>> = {
    pro:    { label: 'Más popular', cls: 'bg-violet-500/15 text-violet-400' },
    growth: { label: 'Nuevo',       cls: 'bg-emerald-500/15 text-emerald-400' },
}
