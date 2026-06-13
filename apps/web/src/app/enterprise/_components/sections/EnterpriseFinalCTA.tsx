'use client'

import { ExternalLink, Phone, ShieldCheck, Clock, Sparkles } from 'lucide-react'
import { CALENDLY_URL, CONTACT_EMAIL } from '../../_data/enterprise-content'
import { Reveal } from '@/components/motion/Reveal'

const FOOTNOTE_BADGES = [
  { icon: Clock, label: 'Sin permanencia' },
  { icon: ShieldCheck, label: 'Datos seguros' },
  { icon: Sparkles, label: 'Onboarding 48h' },
] as const

export function EnterpriseFinalCTA() {
  return (
    <section
      id="contacto"
      className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
      style={{ background: '#0A0A0D' }}
      aria-labelledby="cta-heading"
    >
      {/* Top gradient blend with Pricing (light) */}
      <div
        className="pointer-events-none absolute -top-16 inset-x-0 h-32"
        style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, transparent 100%)', opacity: 0.04 }}
        aria-hidden
      />

      <Reveal variant="scale" className="relative mx-auto max-w-3xl">
        <div
          className="relative rounded-[28px] p-10 sm:p-14 text-center overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 80% 80% at 50% 0%, rgba(0,122,255,0.18) 0%, rgba(0,229,255,0.06) 40%, rgba(18,18,18,1) 75%)',
            border: '1px solid rgba(0,229,255,0.2)',
            boxShadow: '0 40px 80px -20px rgba(0,122,255,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Ambient glow */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-50"
            style={{ background: 'radial-gradient(circle, rgba(0,122,255,0.6), transparent 70%)' }}
            aria-hidden
          />
          {/* Cyan glow lower right */}
          <div
            className="pointer-events-none absolute -bottom-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-25"
            style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.6), transparent 70%)' }}
            aria-hidden
          />

          <div className="relative">
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#00E5FF] mb-4">
              {'// HABLEMOS'}
            </p>
            <h2
              id="cta-heading"
              className="text-3xl sm:text-5xl font-display font-black tracking-[-0.02em] text-white mb-4 leading-[1.05]"
            >
              Plan a medida
              <br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #00E5FF 0%, #7CC1FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                para tu organización.
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/60 mb-10 max-w-lg mx-auto leading-relaxed">
              Cada gimnasio, academia o franquicia es distinta. Agendá una demo de 30 minutos
              y armamos un plan personalizado para tu operación.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="final-cta-primary"
                className="eva-pulse-cta flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#007AFF] px-8 text-sm font-bold text-white transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                style={{ boxShadow: '0 4px 32px rgba(0,122,255,0.55)' }}
              >
                <Phone className="h-4 w-4" aria-hidden />
                Agendar demo de 30 min
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-white/20 px-8 text-sm font-medium text-white/80 hover:border-white/40 hover:text-white hover:bg-white/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                style={{ backdropFilter: 'blur(8px)' }}
              >
                Contactar por email
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {FOOTNOTE_BADGES.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-xs text-white/40"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
