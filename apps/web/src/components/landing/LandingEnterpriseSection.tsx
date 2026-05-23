'use client'

import { motion } from 'framer-motion'
import { ExternalLink, Users2, ShieldCheck, BarChart3, ArrowRight } from 'lucide-react'

const ENTERPRISE_URL = 'https://enterprise.eva-app.cl'
const CALENDLY_URL = 'https://calendly.com/contacto-eva-app/eva-enterprise'

const VALUE_PROPS = [
  {
    icon: Users2,
    title: 'Pool de alumnos compartido',
    desc: 'Asigná alumnos a coaches con un clic. Sin hojas de cálculo ni silos de datos.',
  },
  {
    icon: ShieldCheck,
    title: 'Datos aislados por coach',
    desc: 'Row-Level Security a nivel de base de datos. Privacidad garantizada dentro de tu org.',
  },
  {
    icon: BarChart3,
    title: 'Reportes en tiempo real',
    desc: 'Health score por coach, adherencia nutricional y alertas automáticas desde un solo panel.',
  },
]

const HIGHLIGHTS = [
  'White-label por coach incluido',
  'MFA obligatorio para admins',
  '30 días de prueba gratis',
  'Onboarding en 48hs hábiles',
]

export function LandingEnterpriseSection() {
  return (
    <section
      id="enterprise"
      className="scroll-mt-28 relative py-16 sm:py-24 overflow-hidden"
      aria-labelledby="enterprise-section-heading"
    >
      {/* Dark panel background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            linear-gradient(to bottom, transparent, rgba(9,9,11,0.97) 10%, rgba(9,9,11,0.97) 90%, transparent),
            radial-gradient(ellipse 60% 60% at 70% 20%, rgba(245,158,11,0.10), transparent),
            radial-gradient(ellipse 40% 40% at 10% 80%, rgba(245,158,11,0.05), transparent)
          `,
        }}
      />
      {/* Grid texture */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">
            Para Gyms, Academias y Franquicias
          </span>

          <h2
            id="enterprise-section-heading"
            className="mt-5 font-display text-3xl font-black tracking-tight text-zinc-100 sm:text-4xl"
          >
            Un panel para todo tu equipo
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Hasta 20+ coaches bajo un solo panel. White-label por coach incluido.
            Sin hojas de cálculo. Sin confusión entre equipos.
          </p>
        </motion.div>

        {/* Value props grid */}
        <div className="grid gap-4 sm:grid-cols-3 mb-10">
          {VALUE_PROPS.map((prop, i) => (
            <motion.div
              key={prop.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 backdrop-blur-sm hover:border-amber-500/30 transition-colors duration-300"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                <prop.icon className="h-5 w-5 text-amber-400" aria-hidden strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold text-zinc-100 mb-1">{prop.title}</h3>
              <p className="text-xs leading-relaxed text-zinc-400">{prop.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-2xl border border-amber-500/20 bg-zinc-950/80 p-6 sm:p-8 backdrop-blur-sm"
          style={{ boxShadow: '0 0 40px rgba(245,158,11,0.08)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-lg font-black text-zinc-100">
                Desde $89.990 CLP<span className="text-base font-medium text-zinc-400">/mes</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                4 planes · Starter / Pro / Elite / Enterprise custom
              </p>

              {/* Highlight pills */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {HIGHLIGHTS.map(h => (
                  <span
                    key={h}
                    className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[10px] font-medium text-zinc-500"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <a
                href={ENTERPRISE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-6 text-sm font-bold text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.3)] hover:from-amber-400 hover:to-amber-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap"
              >
                Conocé EVA Enterprise
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 text-sm font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap"
              >
                Agendar demo de 30 min
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>

          <p className="mt-5 text-[11px] text-zinc-600 border-t border-zinc-800 pt-4">
            Acceso, login y panel enterprise separados en{' '}
            <span className="text-zinc-500 font-medium">enterprise.eva-app.cl</span>
          </p>
        </motion.div>

      </div>
    </section>
  )
}
