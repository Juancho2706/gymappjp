// RN equivalent: FlatList horizontal with snapToInterval (mobile) or 2x2 grid (tablet)

import { USE_CASES } from '../../_data/enterprise-content'
import { UseCaseCard } from '../molecules/UseCaseCard'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseUseCases() {
  return (
    <section
      id="casos"
      className="py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: '#020617' }}
      aria-labelledby="usecases-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">Casos de uso</SectionEyebrow>
          <h2 id="usecases-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            Para cada tipo de organización
          </h2>
          <p className="mt-3 text-base text-zinc-400 max-w-lg mx-auto">
            Desde un gym de barrio hasta una cadena nacional. EVA Enterprise se adapta.
          </p>
        </div>

        {/* Snap carousel on mobile, grid on md+ */}
        <div
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4 md:pb-0"
          role="region"
          aria-label="Casos de uso de EVA Enterprise"
        >
          {USE_CASES.map((uc) => (
            <div key={uc.title} className="snap-start shrink-0 w-72 md:w-auto">
              <UseCaseCard
                icon={uc.icon}
                title={uc.title}
                desc={uc.desc}
                tags={uc.tags}
                className="h-full"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
