'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FAQS } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { Reveal } from '@/components/motion/Reveal'
import { cn } from '@/lib/utils'

export function EnterpriseFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const toggle = (i: number) => setOpenIdx(prev => (prev === i ? null : i))

  return (
    <section
      id="faq"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-14 text-center">
          <SectionEyebrow className="mb-3">{'// PREGUNTAS FRECUENTES'}</SectionEyebrow>
          <h2
            id="faq-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900"
          >
            Todo lo que necesitás saber
          </h2>
        </Reveal>

        <Reveal>
          <dl className="space-y-2">
            {FAQS.map((item, i) => {
              const open = openIdx === i
              return (
                <div
                  key={item.q}
                  className={cn(
                    'rounded-2xl border overflow-hidden transition-colors duration-300',
                    open
                      ? 'border-[#007AFF]/30 bg-gradient-to-br from-[#007AFF]/5 to-white'
                      : 'border-gray-200 bg-white hover:border-gray-300',
                  )}
                >
                  <dt>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-inset rounded-2xl"
                      aria-expanded={open}
                      aria-controls={`faq-answer-${i}`}
                    >
                      <span
                        className={cn(
                          'text-sm sm:text-base font-semibold transition-colors',
                          open ? 'text-[#007AFF]' : 'text-gray-800',
                        )}
                      >
                        {item.q}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-5 w-5 shrink-0 transition-transform duration-300',
                          open ? 'rotate-180 text-[#007AFF]' : 'text-gray-400',
                        )}
                        aria-hidden
                      />
                    </button>
                  </dt>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.dd
                        id={`faq-answer-${i}`}
                        role="region"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-sm leading-relaxed text-gray-600">
                          {item.a}
                        </p>
                      </motion.dd>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}
