// RN equivalent: FlatList horizontal with snap + TestimonialCard

import { TESTIMONIALS } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseTestimonials() {
  return (
    <section
      id="testimonios"
      className="py-20 px-4 sm:px-6 lg:px-8"
      aria-labelledby="testimonials-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">Testimonios</SectionEyebrow>
          <h2 id="testimonials-heading" className="text-3xl font-black tracking-tight text-zinc-100">
            Lo que dicen nuestros clientes
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map(t => (
            <figure
              key={t.author}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-sm"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4" aria-label="5 estrellas">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className="h-4 w-4 fill-amber-400" viewBox="0 0 20 20" aria-hidden>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm leading-relaxed text-zinc-300 mb-5">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <figcaption className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
                  <span className="text-xs font-bold text-amber-400">{t.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{t.author}</p>
                  <p className="text-xs text-zinc-500">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
