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
    <section aria-label="Organizaciones que usan EVA Enterprise" className="py-12 overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <GlowDot color="green" />
          <p className="text-xs font-medium text-gray-400">Confían en EVA Enterprise</p>
        </div>
      </div>

      <div
        className="relative flex gap-4 overflow-hidden"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}
      >
        {[0, 1].map(i => (
          <div
            key={i}
            className="flex shrink-0 gap-4 eva-animate-marquee"
            aria-hidden={i === 1}
          >
            {LOGOS.map(name => (
              <div
                key={`${i}-${name}`}
                className="flex h-12 shrink-0 items-center rounded-xl border border-gray-200 bg-gray-50 px-5"
              >
                <span className="whitespace-nowrap text-sm font-semibold text-gray-500">{name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
