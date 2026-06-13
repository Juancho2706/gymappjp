'use client'

import { USE_CASES } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { Reveal, RevealStagger, RevealItem } from '@/components/motion/Reveal'
import { cn } from '@/lib/utils'

const ACCENTS = ['#007AFF', '#00E5FF', '#0040DD', '#7C3AED'] as const

export function EnterpriseUseCases() {
  return (
    <section
      id="casos"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="usecases-heading"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <SectionEyebrow className="mb-3">{'// CASOS DE USO'}</SectionEyebrow>
          <h2
            id="usecases-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900"
          >
            Para cada tipo de organización
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-500 max-w-xl mx-auto">
            Desde un gym de barrio hasta una cadena nacional. EVA Enterprise se adapta a la
            estructura que ya tenés.
          </p>
        </Reveal>

        <RevealStagger
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4 md:pb-0"
        >
          {USE_CASES.map((uc, i) => {
            const accent = ACCENTS[i % ACCENTS.length]
            const Icon = uc.icon
            return (
              <RevealItem
                key={uc.title}
                className="snap-start shrink-0 w-72 md:w-auto"
              >
                <article
                  className={cn(
                    'group relative h-full overflow-hidden rounded-2xl border border-gray-100 bg-white p-6',
                    'transition-all duration-300 hover:-translate-y-1.5',
                    'shadow-[0_8px_32px_0_rgba(0,0,0,0.06)]',
                  )}
                  style={{
                    boxShadow: '0 8px 32px 0 rgba(0,0,0,0.06)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${accent}55`
                    e.currentTarget.style.boxShadow = `0 18px 48px -8px ${accent}33`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = ''
                    e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.06)'
                  }}
                >
                  {/* Background icon decoration */}
                  <Icon
                    className="absolute -right-4 -bottom-4 h-32 w-32 pointer-events-none"
                    style={{ color: accent, opacity: 0.05 }}
                    aria-hidden
                    strokeWidth={1}
                  />

                  <div
                    className="relative flex h-11 w-11 items-center justify-center rounded-xl border mb-4 transition-colors"
                    style={{
                      borderColor: `${accent}33`,
                      background: `${accent}10`,
                    }}
                  >
                    <Icon
                      className="h-5 w-5 transition-colors"
                      aria-hidden
                      strokeWidth={1.5}
                      style={{ color: accent }}
                    />
                  </div>
                  <h3 className="relative text-sm font-bold text-gray-900 mb-2">{uc.title}</h3>
                  <p className="relative text-xs leading-relaxed text-gray-500 mb-4">{uc.desc}</p>
                  <div className="relative flex flex-wrap gap-1.5">
                    {uc.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                        style={{
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: `${accent}33`,
                          background: `${accent}08`,
                          color: accent,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              </RevealItem>
            )
          })}
        </RevealStagger>
      </div>
    </section>
  )
}
