'use client'

// RN equivalent: Animated.View with LayoutAnimation accordion + FlatList

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FAQS } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { cn } from '@/lib/utils'

export function EnterpriseFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const toggle = (i: number) => setOpenIdx(prev => (prev === i ? null : i))

  return (
    <section
      id="faq"
      className="py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: '#020617' }}
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">Preguntas frecuentes</SectionEyebrow>
          <h2 id="faq-heading" className="text-3xl font-black tracking-tight text-zinc-100">
            Todo lo que necesitás saber
          </h2>
        </div>

        <dl className="space-y-2">
          {FAQS.map((item, i) => (
            <div
              key={item.q}
              className={cn(
                'rounded-2xl border transition-colors duration-200',
                openIdx === i
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-zinc-800 bg-zinc-900/60',
              )}
            >
              <dt>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset rounded-2xl"
                  aria-expanded={openIdx === i}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span className="text-sm font-semibold text-zinc-200">{item.q}</span>
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-300',
                      openIdx === i && 'rotate-180 text-amber-400',
                    )}
                    aria-hidden
                  />
                </button>
              </dt>
              <dd
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-q-${i}`}
                hidden={openIdx !== i}
                className="px-5 pb-5"
              >
                <p className="text-sm leading-relaxed text-zinc-400">{item.a}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
