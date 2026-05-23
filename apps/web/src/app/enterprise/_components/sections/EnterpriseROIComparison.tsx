'use client'

// RN equivalent: Slider (RN core) + View layout for side-by-side comparison

import { useState } from 'react'
import { calcROI, formatCLP, INDIVIDUAL_PRICE } from '../../_data/enterprise-pricing'
import { ROI_CONTENT } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { TrendingDown, Users2 } from 'lucide-react'

export function EnterpriseROIComparison() {
  const [coaches, setCoaches] = useState(5)
  const roi = calcROI(coaches)

  return (
    <section
      id="roi"
      className="py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: '#020617' }}
      aria-labelledby="roi-heading"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">{ROI_CONTENT.eyebrow}</SectionEyebrow>
          <h2 id="roi-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            {ROI_CONTENT.headline}
          </h2>
          <p className="mt-3 text-base text-zinc-400">{ROI_CONTENT.sub}</p>
        </div>

        {/* Slider */}
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="coaches-slider" className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Users2 className="h-4 w-4 text-amber-400" aria-hidden />
              Número de coaches en tu equipo
            </label>
            <span className="text-2xl font-black text-amber-400">{coaches}</span>
          </div>

          <input
            id="coaches-slider"
            type="range"
            min={1}
            max={25}
            value={coaches}
            onChange={e => setCoaches(Number(e.target.value))}
            className="w-full h-2 rounded-full accent-amber-500 cursor-pointer"
            aria-valuemin={1}
            aria-valuemax={25}
            aria-valuenow={coaches}
            aria-label="Número de coaches"
          />
          <div className="flex justify-between mt-1 text-xs text-zinc-600">
            <span>1</span>
            <span>25</span>
          </div>
        </div>

        {/* Comparison */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Individual */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Cuentas individuales</p>
            <div className="text-3xl font-black text-zinc-300">
              {formatCLP(roi.individualTotal)}
              <span className="text-base font-normal text-zinc-500">/mes</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {coaches} coaches × {formatCLP(INDIVIDUAL_PRICE)}/mes
            </p>
          </div>

          {/* Enterprise plan */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-3">
              {roi.bestPlan?.name ?? 'Enterprise custom'}
            </p>
            <div className="text-3xl font-black text-zinc-100">
              {roi.bestPlan?.priceMonthly ? formatCLP(roi.bestPlan.priceMonthly) : 'A cotizar'}
              {roi.bestPlan?.priceMonthly && (
                <span className="text-base font-normal text-zinc-400">/mes</span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {roi.bestPlan?.coaches ?? '21+ coaches'} · Panel centralizado incluido
            </p>
          </div>
        </div>

        {/* Savings callout */}
        {roi.savings > 0 && (
          <div className="mt-4 rounded-2xl border border-emerald-900/40 bg-emerald-950/30 p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingDown className="h-5 w-5 text-emerald-400" aria-hidden />
              <p className="text-sm font-bold text-emerald-400">Ahorro con EVA Enterprise</p>
            </div>
            <div className="text-3xl font-black text-zinc-100 mt-2">
              {formatCLP(roi.savings)}<span className="text-base font-normal text-zinc-400">/mes</span>
            </div>
            <p className="mt-1 text-zinc-400 text-sm">
              <span className="font-bold text-emerald-400">{formatCLP(roi.annualSavings)}</span> al año
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
