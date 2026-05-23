'use client'

// RN equivalent: FlatList horizontal snapToInterval (mobile) or grid with Switch toggle

import { useState } from 'react'
import { Check, ExternalLink, Star } from 'lucide-react'
import {
  PRICING_TIERS,
  getAnnualPrice,
  formatCLP,
  type PricingBillingCycle,
  type PricingTier,
} from '../../_data/enterprise-pricing'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { cn } from '@/lib/utils'

function PricingCard({ tier, cycle }: { tier: PricingTier; cycle: PricingBillingCycle }) {
  const displayPrice =
    tier.priceMonthly === null
      ? null
      : cycle === 'annual'
        ? getAnnualPrice(tier.priceMonthly)
        : tier.priceMonthly

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-2xl border p-6 transition-all duration-200',
        tier.highlight
          ? 'border-amber-500/40 bg-amber-500/5 shadow-[0_0_40px_rgba(245,158,11,0.12)]'
          : 'border-zinc-800 bg-zinc-900/60 backdrop-blur-sm',
      )}
      aria-label={`Plan ${tier.name}`}
    >
      {/* Badge */}
      {tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold',
              tier.badgeVariant === 'popular'
                ? 'bg-amber-500 text-zinc-950'
                : 'border border-zinc-600 bg-zinc-800 text-zinc-300',
            )}
          >
            {tier.badgeVariant === 'popular' && <Star className="h-3 w-3 fill-current" aria-hidden />}
            {tier.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-zinc-100">{tier.name}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{tier.tagline}</p>
      </div>

      {/* Price */}
      <div className="mb-5">
        {displayPrice !== null ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-zinc-100">{formatCLP(displayPrice)}</span>
              <span className="text-sm text-zinc-400">/mes</span>
            </div>
            {cycle === 'annual' && tier.priceMonthly && (
              <p className="text-xs text-amber-400 mt-1 font-medium">
                20% off · {formatCLP(displayPrice * 12)}/año
              </p>
            )}
          </>
        ) : (
          <div className="text-2xl font-black text-zinc-100">A cotizar</div>
        )}
        <p className="text-xs text-zinc-500 mt-1">{tier.coaches}</p>
      </div>

      {/* Features */}
      <ul className="flex-1 space-y-2.5 mb-6">
        {tier.features.map(feat => (
          <li key={feat.text} className="flex items-start gap-2.5">
            <Check
              className={cn('h-4 w-4 shrink-0 mt-0.5', feat.highlight ? 'text-amber-400' : 'text-zinc-500')}
              aria-hidden
            />
            <span className={cn('text-xs leading-relaxed', feat.highlight ? 'text-zinc-200 font-medium' : 'text-zinc-400')}>
              {feat.text}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <a
        href={tier.ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          tier.ctaVariant === 'primary' && 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.35)] hover:from-amber-400 hover:to-amber-500',
          tier.ctaVariant === 'outline' && 'border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
          tier.ctaVariant === 'ghost' && 'border border-zinc-700 text-zinc-400 hover:border-amber-500/40 hover:text-amber-400',
        )}
      >
        {tier.cta}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </article>
  )
}

export function EnterprisePricing() {
  const [cycle, setCycle] = useState<PricingBillingCycle>('monthly')

  return (
    <section
      id="precios"
      className="py-20 px-4 sm:px-6 lg:px-8"
      aria-labelledby="pricing-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">Precios</SectionEyebrow>
          <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            4 planes, un solo panel
          </h2>
          <p className="mt-3 text-base text-zinc-400 max-w-lg mx-auto">
            Todos los planes incluyen white-label por coach, onboarding y 30 días de prueba gratis.
          </p>

          {/* Billing toggle */}
          <div
            className="mt-6 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/60 p-1"
            role="group"
            aria-label="Ciclo de facturación"
          >
            {(['monthly', 'annual'] as PricingBillingCycle[]).map(c => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                  cycle === c
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-200',
                )}
                aria-pressed={cycle === c}
              >
                {c === 'monthly' ? 'Mensual' : 'Anual'}
                {c === 'annual' && (
                  <span className="ml-1.5 text-[10px] font-bold text-amber-400">-20%</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards: snap carousel on mobile <lg, grid on lg+ */}
        <div
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0"
          role="region"
          aria-label="Planes de precios EVA Enterprise"
        >
          {PRICING_TIERS.map(tier => (
            <div key={tier.id} className="snap-start shrink-0 w-72 lg:w-auto">
              <PricingCard tier={tier} cycle={cycle} />
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Precios expresados en CLP. No incluyen IVA cuando corresponda.
          Pago por transferencia bancaria o MercadoPago.
        </p>
      </div>
    </section>
  )
}
