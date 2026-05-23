// RN equivalent: ScrollView + LinearGradient hero + Text headline + Pressable CTAs

import { ExternalLink, ArrowRight } from 'lucide-react'
import { CALENDLY_URL, ENTERPRISE_LOGIN_PATH, HERO } from '../../_data/enterprise-content'
import { GoldBadge } from '../atoms/GoldBadge'

export function EnterpriseHero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-dvh flex-col items-center justify-center px-4 pt-24 pb-16 text-center sm:px-6 lg:px-8 overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Gradient mesh background */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 60% -10%, rgba(245,158,11,0.13), transparent),
            radial-gradient(ellipse 50% 40% at 90% 70%, rgba(251,191,36,0.07), transparent),
            radial-gradient(ellipse 40% 50% at 10% 80%, rgba(245,158,11,0.05), transparent)
          `,
        }}
      />

      {/* Grid texture — attenuated on mobile for perf */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.025] sm:opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Eyebrow */}
        <GoldBadge className="mb-6">{HERO.eyebrow}</GoldBadge>

        {/* Headline */}
        <h1
          id="hero-heading"
          className="font-display font-black tracking-tight text-zinc-100 leading-[1.05] text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
        >
          {HERO.headline.split('\n').map((line, i) => (
            <span key={i}>
              {i === 0 ? line : <><br /><span className="text-amber-400">{line}</span></>}
            </span>
          ))}
        </h1>

        {/* Sub */}
        <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
          {HERO.sub}
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-8 text-sm font-bold text-zinc-950 shadow-[0_4px_24px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_6px_32px_rgba(245,158,11,0.55)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            {HERO.ctaPrimary}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={ENTERPRISE_LOGIN_PATH}
            className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-zinc-700 px-8 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            {HERO.ctaSecondary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        {/* Trust badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {HERO.trustBadges.map(badge => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-[11px] font-medium text-zinc-400"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-32 z-10"
           style={{ background: 'linear-gradient(to bottom, transparent, #09090b)' }} />
    </section>
  )
}
