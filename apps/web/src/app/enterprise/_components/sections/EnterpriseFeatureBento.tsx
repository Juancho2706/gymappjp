// RN equivalent: FlatList 1-col (mobile) or 2-col (tablet) with FeatureCard

import { FEATURES } from '../../_data/enterprise-content'
import { FeatureCard } from '../molecules/FeatureCard'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseFeatureBento() {
  return (
    <section
      id="producto"
      className="py-20 px-4 sm:px-6 lg:px-8"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12">
          <SectionEyebrow className="mb-3">Características</SectionEyebrow>
          <h2 id="features-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100 max-w-xl">
            Todo lo que necesita tu organización
          </h2>
          <p className="mt-3 text-base text-zinc-400 max-w-lg">
            Panel centralizado, datos aislados por coach, y white-label incluido en cada plan.
          </p>
        </div>

        {/* Bento grid: 1col mobile → 2col sm → 3col lg */}
        {/* Large cards span 2 cols on md+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              desc={feature.desc}
              size={feature.size as 'normal' | 'large'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
