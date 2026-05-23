'use client'

import { TESTIMONIALS } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { Reveal, RevealStagger, RevealItem } from '../atoms/Reveal'
import { Quote } from 'lucide-react'

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #007AFF 0%, #00E5FF 100%)',
  'linear-gradient(135deg, #0040DD 0%, #007AFF 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #00E5FF 100%)',
] as const

export function EnterpriseTestimonials() {
  return (
    <section
      id="testimonios"
      className="py-24 px-4 sm:px-6 lg:px-8"
      style={{ background: '#F8FAFC' }}
      aria-labelledby="testimonials-heading"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-14 text-center">
          <SectionEyebrow className="mb-3">{'// TESTIMONIOS'}</SectionEyebrow>
          <h2
            id="testimonials-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900"
          >
            Lo que dicen nuestros clientes
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-500 max-w-xl mx-auto">
            Gyms y academias que ya cambiaron sus planillas por un panel real.
          </p>
        </Reveal>

        <RevealStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <RevealItem key={t.author}>
              <figure
                className="group relative h-full rounded-2xl border border-gray-100 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_-8px_rgba(0,122,255,0.18)]"
              >
                <Quote
                  className="absolute top-5 right-5 h-8 w-8 text-[#007AFF]/10"
                  aria-hidden
                  strokeWidth={1.5}
                />

                {/* Stars */}
                <div className="flex gap-0.5 mb-4" aria-label="5 estrellas">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <svg
                      key={idx}
                      className="h-4 w-4 fill-[#FBBF24]"
                      viewBox="0 0 20 20"
                      aria-hidden
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>

                <blockquote className="text-sm leading-relaxed text-gray-700 mb-6 relative">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                <figcaption className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2 ring-white shadow-sm"
                    style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                  >
                    <span className="text-xs font-bold text-white">{t.initials}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{t.author}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  )
}
