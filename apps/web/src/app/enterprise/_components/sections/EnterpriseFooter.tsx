'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Mail, Send } from 'lucide-react'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { CONTACT_EMAIL } from '../../_data/enterprise-content'

const FOOTER_COLS = [
  {
    label: '// LEGAL',
    links: [
      { label: 'Aviso Legal', href: '/legal' },
      { label: 'Política de Privacidad', href: '/legal#privacidad' },
      { label: 'Contrato Enterprise', href: '/legal/contrato-enterprise' },
      { label: 'DPA (Ley 21.719)', href: '/legal/contrato-enterprise#dpa' },
    ],
  },
  {
    label: '// PRODUCTO',
    links: [
      { label: 'Features', href: '#producto' },
      { label: 'Stack', href: '#stack' },
      { label: 'Precios', href: '#precios' },
      { label: 'ROI', href: '#roi' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
] as const

const BOTTOM_LINKS = [
  { label: 'Aviso Legal', href: '/legal' },
  { label: 'Contrato', href: '/legal/contrato-enterprise' },
] as const

export function EnterpriseFooter() {
  return (
    <footer
      className="relative border-t border-white/10 py-16 px-4 sm:px-6 lg:px-8 pb-safe overflow-hidden"
      style={{ background: '#0A0A0D', color: '#f4f4f5' }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-3xl opacity-20"
        style={{
          background:
            'radial-gradient(ellipse, rgba(0,122,255,0.5), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1280px]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand col */}
          <div className="space-y-4">
            <Link
              href="/enterprise"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
            >
              <Image src={BRAND_APP_ICON} alt="" width={32} height={32} className="rounded-lg" />
              <span
                className="text-2xl font-display font-black tracking-tighter"
                style={{
                  background: 'linear-gradient(90deg, #ffffff 0%, #007AFF 55%, #00E5FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                EVA
              </span>
            </Link>
            <p className="text-sm text-white/50 leading-relaxed">
              Panel de operaciones enterprise para gyms, academias y franquicias fitness en
              Latinoamérica.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-[#00E5FF] transition-colors"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {CONTACT_EMAIL}
            </a>
          </div>

          {/* Link cols */}
          {FOOTER_COLS.map(col => (
            <div key={col.label}>
              <h5 className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#00E5FF] mb-5">
                {col.label}
              </h5>
              <ul className="space-y-3">
                {col.links.map(link => (
                  <li key={`${col.label}-${link.href}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/55 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] rounded"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter col */}
          <div>
            <h5 className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#00E5FF] mb-5">
              {'// NEWSLETTER'}
            </h5>
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              Insights sobre escalado fitness, RLS y operaciones enterprise. Un correo al mes,
              sin spam.
            </p>
            <form
              className="flex gap-2"
              onSubmit={e => e.preventDefault()}
              aria-label="Suscripción a newsletter"
            >
              <input
                type="email"
                placeholder="tucorreo@gym.cl"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 backdrop-blur px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#00E5FF] focus:bg-white/10 transition-all"
                aria-label="Email"
              />
              <button
                type="submit"
                className="rounded-lg px-3 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
                style={{
                  background: 'linear-gradient(135deg, #007AFF 0%, #00E5FF 100%)',
                  boxShadow: '0 4px 16px -4px rgba(0,122,255,0.5)',
                }}
                aria-label="Suscribirse"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} EVA Enterprise · Todos los derechos reservados
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {BOTTOM_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-white/30 hover:text-[#00E5FF] transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-white/20">Hecho en Chile</p>
        </div>
      </div>
    </footer>
  )
}
