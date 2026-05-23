// RN equivalent: FlatList horizontal with auto-scroll animation

import { GlowDot } from '../atoms/GlowDot'

const LOGOS = [
  'Gym Urbano Santiago',
  'CrossFit Providencia',
  'Fit Network',
  'Academia Elite',
  'BoxFit Vitacura',
  'Entrenamiento Colectivo',
  'Sport Center Chile',
  'Move Studio',
]

export function EnterpriseLogoWall() {
  return (
    <section aria-label="Organizaciones que usan EVA Enterprise" className="py-12 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <GlowDot />
          <p className="text-xs font-medium text-zinc-500">Confían en EVA Enterprise</p>
        </div>
      </div>

      {/* Marquee container */}
      <div
        className="relative flex gap-4 overflow-hidden"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}
      >
        {/* Two copies for seamless loop */}
        {[0, 1].map(i => (
          <div
            key={i}
            className="flex shrink-0 gap-4 animate-marquee"
            aria-hidden={i === 1}
          >
            {LOGOS.map(name => (
              <div
                key={`${i}-${name}`}
                className="flex h-12 shrink-0 items-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-5"
              >
                <span className="whitespace-nowrap text-sm font-semibold text-zinc-500">{name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 28s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee { animation: none; }
        }
      `}</style>
    </section>
  )
}
