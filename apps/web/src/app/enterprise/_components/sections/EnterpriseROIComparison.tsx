'use client'

import { useState } from 'react'
import { calcROIAllPlans, formatCLP } from '../../_data/enterprise-pricing'
import { Users2, TrendingDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LottiePlayer } from '../atoms/LottiePlayer'
import { Reveal, RevealStagger, RevealItem } from '../atoms/Reveal'
import { StatNumber } from '../atoms/StatNumber'

export function EnterpriseROIComparison() {
  const [coaches, setCoaches] = useState(5)
  const [clients, setClients] = useState(500)
  const roi = calcROIAllPlans(coaches)

  const bestPlan = roi.plans.find(p => p.isBest)
  const impactMonthly = Math.round((coaches * 0.2 + clients * 0.001) * 200000)

  return (
    <section
      id="roi"
      className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
      style={{ background: '#121212', color: '#f4f4f5' }}
      aria-labelledby="roi-heading"
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] blur-[120px] opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,122,255,0.45), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1280px]">
        {/* Top: headline + Lottie + controls */}
        <div
          className="rounded-3xl p-8 sm:p-12 mb-8"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_1fr] gap-8 items-center">
            {/* Left: headline + best saving */}
            <Reveal>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#00E5FF] mb-4">
                {'// ROI CALCULADO EN VIVO'}
              </p>
              <h2
                id="roi-heading"
                className="text-3xl sm:text-4xl font-display font-black text-white mb-4 leading-[1.1] tracking-[-0.02em]"
              >
                Calculá cuánto ahorra tu gym
              </h2>
              <p className="text-base text-white/60 mb-8 leading-relaxed">
                Cada coach con cuenta individual cuesta más de lo que pensás. Movés el
                slider y ves el ahorro real con tu mejor plan Enterprise.
              </p>

              <div className="grid grid-cols-2 gap-6 border-t border-white/10 pt-8">
                <div>
                  <div
                    className="text-3xl sm:text-4xl font-display font-black tabular-nums"
                    style={{ color: '#00E5FF' }}
                  >
                    {bestPlan && bestPlan.savings > 0 ? (
                      <StatNumber
                        key={`m-${bestPlan.savings}`}
                        value={bestPlan.savings}
                        format="currency-clp"
                        duration={0.9}
                      />
                    ) : (
                      formatCLP(0)
                    )}
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/50 mt-1">
                    {'// Ahorro Mensual'}
                  </div>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-display font-black text-white tabular-nums">
                    {bestPlan && bestPlan.annualSavings > 0 ? (
                      <StatNumber
                        key={`y-${bestPlan.annualSavings}`}
                        value={bestPlan.annualSavings}
                        format="currency-clp"
                        duration={1.2}
                      />
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/50 mt-1">
                    {'// Ahorro Anual'}
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Center: Lottie time-balance */}
            <Reveal variant="scale" delay={0.15} className="hidden lg:block">
              <div className="relative w-full aspect-square">
                <div
                  className="absolute inset-0 rounded-full blur-3xl opacity-50"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(0,229,255,0.35), transparent 70%)',
                  }}
                  aria-hidden
                />
                <div className="relative w-full h-full">
                  <LottiePlayer
                    src="/lottie/time-balance.json"
                    ariaLabel="Animación de balance de tiempo y eficiencia"
                  />
                </div>
              </div>
            </Reveal>

            {/* Right: sliders + impact */}
            <Reveal delay={0.1}>
              <div
                className="rounded-2xl p-6 space-y-6"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                {/* Coaches slider */}
                <div>
                  <label
                    htmlFor="roi-coaches"
                    className="flex items-center justify-between mb-2 text-[11px] font-mono uppercase tracking-[0.15em] text-white/70"
                  >
                    <span className="flex items-center gap-1.5">
                      <Users2 className="h-4 w-4 text-[#007AFF]" aria-hidden />
                      Número de Coaches
                    </span>
                    <span className="text-white font-bold text-base tabular-nums">{coaches}</span>
                  </label>
                  <input
                    id="roi-coaches"
                    type="range"
                    min={1}
                    max={25}
                    value={coaches}
                    onChange={e => setCoaches(Number(e.target.value))}
                    className="w-full h-1 rounded-full cursor-pointer"
                    style={{ accentColor: '#007AFF' }}
                    aria-label="Número de coaches"
                  />
                  <div className="flex justify-between mt-1 text-xs text-white/30">
                    <span>1</span>
                    <span>25</span>
                  </div>
                </div>

                {/* Clients slider */}
                <div>
                  <label
                    htmlFor="roi-clients"
                    className="flex items-center justify-between mb-2 text-[11px] font-mono uppercase tracking-[0.15em] text-white/70"
                  >
                    <span>Clientes Totales</span>
                    <span className="text-white font-bold text-base tabular-nums">{clients}</span>
                  </label>
                  <input
                    id="roi-clients"
                    type="range"
                    min={50}
                    max={2000}
                    step={50}
                    value={clients}
                    onChange={e => setClients(Number(e.target.value))}
                    className="w-full h-1 rounded-full cursor-pointer"
                    style={{ accentColor: '#007AFF' }}
                    aria-label="Número de clientes"
                  />
                  <div className="flex justify-between mt-1 text-xs text-white/30">
                    <span>50</span>
                    <span>2000</span>
                  </div>
                </div>

                {/* Impact callout */}
                <div
                  className="rounded-xl p-4 transition-all duration-300"
                  style={{ background: 'rgba(0,122,255,0.15)', border: '1px solid rgba(0,122,255,0.30)' }}
                >
                  <span className="block text-[11px] font-mono uppercase tracking-[0.15em] text-[#00E5FF] mb-1">
                    Impacto Proyectado
                  </span>
                  <span className="text-xl sm:text-2xl font-display font-bold text-white">
                    Optimización de {formatCLP(impactMonthly)}/mes
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Plan comparison grid */}
        <div className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mb-4">
            {'// Comparación por plan · '}
            {coaches}
            {' coaches · cuentas individuales = '}
            {formatCLP(roi.individualTotal)}
            {'/mes'}
          </p>
          <RevealStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {roi.plans.map(({ tier, applicable, savings, annualSavings, isBest }) => (
              <RevealItem key={tier.id}>
                <div
                  className={cn(
                    'relative rounded-2xl p-5 h-full transition-all duration-300',
                    !applicable && 'opacity-40',
                    isBest
                      ? 'border-2 border-[#00E5FF]'
                      : 'border border-white/10',
                  )}
                  style={
                    isBest
                      ? { background: 'rgba(0,229,255,0.08)', boxShadow: '0 0 32px -8px rgba(0,229,255,0.35)' }
                      : { background: 'rgba(255,255,255,0.04)' }
                  }
                >
                  {isBest && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00E5FF] text-[#121212] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                      Mejor opción
                    </div>
                  )}
                  {!applicable && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                      Límite superado
                    </div>
                  )}

                  <h3 className="text-sm font-display font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-3">{tier.coaches}</p>

                  <div className="mb-3">
                    {tier.priceMonthly !== null ? (
                      <>
                        <span className="text-2xl font-display font-black text-white">{formatCLP(tier.priceMonthly)}</span>
                        <span className="text-xs text-white/40">/mes</span>
                      </>
                    ) : (
                      <span className="text-xl font-display font-black text-white">A cotizar</span>
                    )}
                  </div>

                  {applicable && savings > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden />
                      <div>
                        <p className="text-xs font-bold text-emerald-400">{formatCLP(savings)}/mes</p>
                        <p className="text-[10px] text-white/40">{formatCLP(annualSavings)}/año</p>
                      </div>
                    </div>
                  ) : applicable && savings <= 0 ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white/30 shrink-0" aria-hidden />
                      <p className="text-[10px] text-white/40">Panel de gestión incluido</p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/30">Requiere {tier.coaches}</p>
                  )}
                </div>
              </RevealItem>
            ))}
          </RevealStagger>
        </div>
      </div>
    </section>
  )
}
