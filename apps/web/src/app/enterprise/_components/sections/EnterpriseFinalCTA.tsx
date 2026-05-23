// RN equivalent: View with LinearGradient + Pressable CTAs

import { ExternalLink, Phone } from 'lucide-react'
import { CALENDLY_URL, CONTACT_EMAIL } from '../../_data/enterprise-content'

export function EnterpriseFinalCTA() {
  return (
    <section
      id="contacto"
      className="py-20 px-4 sm:px-6 lg:px-8"
      aria-labelledby="cta-heading"
    >
      <div className="mx-auto max-w-3xl">
        <div
          className="relative rounded-3xl border border-amber-500/20 p-10 sm:p-14 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(9,9,11,1) 60%)',
          }}
        >
          {/* Ambient glow */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.4), transparent 70%)' }}
          />

          <div className="relative">
            <h2 id="cta-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100 mb-4">
              Empezá tu prueba gratis hoy
            </h2>
            <p className="text-base text-zinc-400 mb-8 max-w-lg mx-auto">
              30 días sin costo, sin tarjeta de crédito. Onboarding incluido.
              Cancelás cuando quieras.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-8 text-sm font-bold text-zinc-950 shadow-[0_4px_24px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                <Phone className="h-4 w-4" aria-hidden />
                Agendar demo de 30 min
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-zinc-700 px-8 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                Contactar por email
              </a>
            </div>

            <p className="mt-6 text-xs text-zinc-600">
              Sin compromiso de permanencia · Datos seguros · Onboarding en 48hs hábiles
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
