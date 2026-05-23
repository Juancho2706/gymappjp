// RN equivalent: FlatList 1-col (mobile) or 2-col grid with VStack icon+text

import { SECURITY } from '../../_data/enterprise-content'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseSecurityCompliance() {
  return (
    <section
      id="seguridad"
      className="py-20 px-4 sm:px-6 lg:px-8"
      aria-labelledby="security-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12">
          <SectionEyebrow className="mb-3">{SECURITY.eyebrow}</SectionEyebrow>
          <h2 id="security-heading" className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100 max-w-xl">
            {SECURITY.headline}
          </h2>
          <p className="mt-3 text-base text-zinc-400 max-w-lg">
            Seguridad no es un feature, es la base. RLS nativo, MFA obligatorio, y compliance chileno incluidos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECURITY.items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 mb-4">
                  <Icon className="h-5 w-5 text-zinc-300" aria-hidden strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-bold text-zinc-100 mb-2">{item.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{item.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Compliance badges */}
        <div className="mt-8 flex flex-wrap gap-2 justify-center sm:justify-start">
          {['PostgreSQL RLS', 'TOTP MFA', 'Ley 19.628 Chile', 'Ley 21.719 DPA', 'Cookie isolation', 'Audit trail'].map(badge => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-400"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
