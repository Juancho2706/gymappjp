'use client'

import { XCircle, CheckCircle2 } from 'lucide-react'
import { PROBLEM } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { Reveal, RevealStagger, RevealItem } from '@/components/motion/Reveal'
import { StatNumber } from '../atoms/StatNumber'

export function EnterpriseProblemStatement() {
  return (
    <section
      id="problema"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="problem-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center mb-16">
          <SectionEyebrow className="mb-3">{PROBLEM.eyebrow}</SectionEyebrow>
          <h2
            id="problem-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900"
          >
            {PROBLEM.headline}
          </h2>
        </Reveal>

        <div className="grid gap-12 md:grid-cols-2 items-start">
          {/* Left: before/after cards */}
          <RevealStagger className="space-y-6">
            <RevealItem>
              {/* Traditional with red left accent */}
              <div
                className="relative p-8 rounded-2xl border border-gray-200 bg-gray-50 transition-all hover:-translate-y-1 hover:shadow-lg duration-300 overflow-hidden"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ background: 'linear-gradient(180deg, #FF3B30 0%, #FF7A6D 100%)' }}
                  aria-hidden
                />
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-red-500" aria-hidden />
                  </div>
                  <h3 className="text-xl font-display font-bold text-red-600">
                    Tradicional (Excel + WhatsApp)
                  </h3>
                </div>
                <ul className="space-y-3">
                  {PROBLEM.pains.map(pain => (
                    <li key={pain.title} className="flex items-start gap-3 text-sm text-gray-600">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden />
                      <span>
                        <strong className="text-gray-800">{pain.title}:</strong> {pain.desc}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </RevealItem>

            <RevealItem>
              {/* EVA Enterprise with blue accent */}
              <div
                className="relative overflow-hidden p-8 rounded-2xl bg-gradient-to-br from-[#007AFF]/8 to-white transition-all hover:-translate-y-1 hover:shadow-xl duration-300"
                style={{ border: '2px solid #007AFF', boxShadow: '0 8px 32px -8px rgba(0,122,255,0.15)' }}
              >
                <div
                  className="absolute top-0 right-0 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl"
                  style={{ background: 'linear-gradient(135deg, #007AFF 0%, #00E5FF 100%)' }}
                >
                  Recomendado
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-[#007AFF]/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-[#007AFF]" aria-hidden />
                  </div>
                  <h3 className="text-xl font-display font-bold text-[#007AFF]">
                    Con EVA Enterprise
                  </h3>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-sm text-gray-800">
                    <CheckCircle2 className="h-4 w-4 text-[#007AFF] shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>Pool centralizado:</strong> Todos los alumnos en una única fuente de verdad.
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-gray-800">
                    <CheckCircle2 className="h-4 w-4 text-[#007AFF] shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>PostgreSQL RLS:</strong> Cada coach solo ve lo que tú le permites — a nivel DB.
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-gray-800">
                    <CheckCircle2 className="h-4 w-4 text-[#007AFF] shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>Escalabilidad automática:</strong> Gestionás sin límites operativos.
                    </span>
                  </li>
                </ul>
              </div>
            </RevealItem>
          </RevealStagger>

          {/* Right: stats */}
          <RevealStagger className="space-y-6">
            <RevealItem>
              <div className="p-8 rounded-2xl border border-gray-100 bg-white shadow-sm">
                <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-gray-400 mb-1">
                  {'// Ahorro anual por coach'}
                </p>
                <p className="text-5xl font-display font-black text-[#007AFF] tabular-nums">
                  <StatNumber value={719520} format="currency-clp" duration={1.6} />
                </p>
                <p className="text-sm text-gray-500 mt-2">vs cuentas individuales EVA</p>
              </div>
            </RevealItem>
            <RevealItem>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-gray-400 mb-1">
                    {'// Coaches'}
                  </p>
                  <p className="text-3xl font-display font-black text-gray-900 tabular-nums">
                    +<StatNumber value={5} duration={0.8} />
                  </p>
                  <p className="text-xs text-gray-500 mt-1">por plan Starter</p>
                </div>
                <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-gray-400 mb-1">
                    {'// White-label'}
                  </p>
                  <p className="text-3xl font-display font-black text-gray-900 tabular-nums">
                    ×<StatNumber value={20} duration={0.9} />
                  </p>
                  <p className="text-xs text-gray-500 mt-1">apps por coach incluidas</p>
                </div>
              </div>
            </RevealItem>
            <RevealItem>
              <div className="p-6 rounded-2xl border border-[#007AFF]/20 bg-[#007AFF]/5">
                <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-[#007AFF] mb-2">
                  {'// Liderazgo moderno'}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Dueños de gyms y academias gestionando equipos enteros con infraestructura
                  enterprise — sin un dev in-house ni hojas de cálculo.
                </p>
              </div>
            </RevealItem>
          </RevealStagger>
        </div>
      </div>
    </section>
  )
}
