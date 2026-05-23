// RN equivalent: ScrollView > VStack with icon cards

import { XCircle, CheckCircle2 } from 'lucide-react'
import { PROBLEM } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseProblemStatement() {
  return (
    <section
      id="problema"
      className="py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: '#020617' }}
      aria-labelledby="problem-heading"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <SectionEyebrow className="mb-3">{PROBLEM.eyebrow}</SectionEyebrow>
          <h2 id="problem-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            {PROBLEM.headline}
          </h2>
        </div>

        {/* Pain points grid */}
        <div className="grid gap-4 sm:grid-cols-3 mb-12">
          {PROBLEM.pains.map(pain => {
            const Icon = pain.icon
            return (
              <div
                key={pain.title}
                className="rounded-2xl border border-red-900/30 bg-red-950/20 p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="h-5 w-5 text-red-500 shrink-0" aria-hidden strokeWidth={1.5} />
                  <h3 className="text-sm font-bold text-zinc-300">{pain.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-zinc-500">{pain.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Arrow divider */}
        <div className="flex justify-center mb-12">
          <div className="flex flex-col items-center gap-2">
            <div className="h-px w-px border-l-2 border-dashed border-zinc-700 h-8" />
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
              <CheckCircle2 className="h-5 w-5 text-amber-400" aria-hidden />
            </div>
            <div className="h-px w-px border-l-2 border-dashed border-zinc-700 h-8" />
          </div>
        </div>

        {/* Solution */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <h3 className="text-xl font-black text-zinc-100 mb-3">{PROBLEM.solution.title}</h3>
          <p className="text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">{PROBLEM.solution.desc}</p>
        </div>
      </div>
    </section>
  )
}
