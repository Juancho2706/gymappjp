'use client'

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
import { Reveal, RevealStagger, RevealItem } from '@/components/motion/Reveal'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

function PricingCard({ tier, cycle }: { tier: PricingTier; cycle: PricingBillingCycle }) {
  const displayPrice =
    tier.priceMonthly === null
      ? null
      : cycle === 'annual'
        ? getAnnualPrice(tier.priceMonthly)
        : tier.priceMonthly

  const isEnterprise = tier.id === 'enterprise'

  return (
    <article
      className={cn(
        'relative flex flex-col h-full rounded-2xl p-6 transition-all duration-300',
        isEnterprise
          ? 'text-white'
          : 'bg-white border border-gray-100',
        tier.highlight && !isEnterprise
          ? 'border-2 border-[#00E5FF] shadow-[0_12px_48px_rgba(0,229,255,0.18)] lg:scale-[1.04]'
          : !isEnterprise
            ? 'shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] hover:-translate-y-1.5 hover:shadow-[0_12px_48px_0_rgba(0,122,255,0.10)]'
            : 'hover:-translate-y-1',
      )}
      style={
        isEnterprise
          ? { background: 'linear-gradient(160deg, #1a1a1f 0%, #121212 60%, #0a0a0d 100%)' }
          : tier.highlight
            ? { background: 'linear-gradient(180deg, #ffffff 0%, #F0F9FF 100%)' }
            : undefined
      }
      aria-label={`Plan ${tier.name}`}
    >
      {/* Badge */}
      {tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap',
              tier.badgeVariant === 'popular'
                ? 'bg-[#00E5FF] text-gray-900'
                : isEnterprise
                  ? 'bg-gray-800 text-white border border-gray-600'
                  : 'border border-gray-200 bg-gray-100 text-gray-600',
            )}
          >
            {tier.badgeVariant === 'popular' && <Star className="h-3 w-3 fill-current" aria-hidden />}
            {tier.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <h3 className={cn('text-base font-display font-bold', isEnterprise ? 'text-white' : 'text-gray-900')}>
          {tier.name}
        </h3>
        <p className={cn('text-xs mt-0.5', isEnterprise ? 'text-white/50' : 'text-gray-400')}>{tier.tagline}</p>
      </div>

      {/* Price */}
      <div className="mb-5">
        {displayPrice !== null ? (
          <>
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  'text-4xl font-display font-black',
                  tier.highlight && !isEnterprise ? 'text-[#007AFF]' : isEnterprise ? 'text-white' : 'text-gray-900',
                )}
              >
                {formatCLP(displayPrice)}
              </span>
              <span className={cn('text-sm', isEnterprise ? 'text-white/40' : 'text-gray-400')}>/mes</span>
            </div>
            {cycle === 'annual' && tier.priceMonthly && (
              <p className="text-xs text-[#007AFF] mt-1 font-medium">
                20% off · {formatCLP(displayPrice * 12)}/año
              </p>
            )}
          </>
        ) : (
          <div className={cn('text-2xl font-display font-black', isEnterprise ? 'text-white' : 'text-gray-900')}>
            Desde $400.000
          </div>
        )}
        <p className={cn('text-xs mt-1', isEnterprise ? 'text-white/40' : 'text-gray-400')}>{tier.coaches}</p>
      </div>

      {/* Features */}
      <ul className="flex-1 space-y-2.5 mb-6">
        {tier.features.map(feat => (
          <li key={feat.text} className="flex items-start gap-2.5">
            <Check
              className={cn(
                'h-4 w-4 shrink-0 mt-0.5',
                feat.highlight
                  ? isEnterprise ? 'text-[#00E5FF]' : 'text-[#007AFF]'
                  : isEnterprise ? 'text-white/40' : 'text-gray-300',
              )}
              aria-hidden
            />
            <span
              className={cn(
                'text-xs leading-relaxed',
                feat.highlight
                  ? isEnterprise ? 'text-white font-medium' : 'text-[#007AFF] font-medium'
                  : isEnterprise ? 'text-white/60' : 'text-gray-500',
              )}
            >
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
          'flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
          tier.ctaVariant === 'primary' && 'bg-[#007AFF] text-white hover:bg-[#0068E0] shadow-[0_2px_12px_rgba(0,122,255,0.35)]',
          tier.ctaVariant === 'outline' && !isEnterprise && 'border border-[#007AFF]/30 text-[#007AFF] hover:bg-[#007AFF]/5',
          tier.ctaVariant === 'ghost' && isEnterprise && 'border border-white/20 text-white hover:border-[#00E5FF]/60 hover:text-[#00E5FF]',
          tier.ctaVariant === 'outline' && isEnterprise && 'border border-white/20 text-white hover:border-white/40',
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
      className="py-24 px-4 sm:px-6 lg:px-8"
      style={{ background: '#F8FAFC' }}
      aria-labelledby="pricing-heading"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 text-center">
          <SectionEyebrow className="mb-3">{'// PRECIOS'}</SectionEyebrow>
          <h2
            id="pricing-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900"
          >
            Inversión para el crecimiento
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-500 max-w-lg mx-auto">
            Planes escalables para cada etapa de tu marca fitness. White-label por coach incluido.
          </p>

          {/* Billing toggle */}
          <div
            className="relative mt-8 inline-flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm"
            role="group"
            aria-label="Ciclo de facturación"
          >
            {(['monthly', 'annual'] as PricingBillingCycle[]).map(c => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={cn(
                  'relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
                  cycle === c
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-800',
                )}
                aria-pressed={cycle === c}
              >
                {cycle === c && (
                  <motion.span
                    layoutId="pricing-toggle"
                    className="absolute inset-0 rounded-full bg-gray-900"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <span className="relative">
                  {c === 'monthly' ? 'Mensual' : 'Anual'}
                  {c === 'annual' && (
                    <span
                      className={cn(
                        'ml-1.5 text-[10px] font-bold',
                        cycle === c ? 'text-[#00E5FF]' : 'text-[#007AFF]',
                      )}
                    >
                      -20%
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        {/* Cards */}
        <RevealStagger
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pt-5 pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0"
        >
          {PRICING_TIERS.map(tier => (
            <RevealItem key={tier.id} className="snap-start shrink-0 w-72 lg:w-auto">
              <PricingCard tier={tier} cycle={cycle} />
            </RevealItem>
          ))}
        </RevealStagger>

        <p className="mt-6 text-center text-xs text-gray-400">
          Precios expresados en CLP. No incluyen IVA cuando corresponda.
          Pago por transferencia bancaria o MercadoPago.
        </p>
      </div>
    </section>
  )
}
