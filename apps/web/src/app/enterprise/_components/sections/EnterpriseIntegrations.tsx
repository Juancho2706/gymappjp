import { INTEGRATIONS } from '../../_data/enterprise-content'
import { IntegrationLogo } from '../molecules/IntegrationLogo'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

export function EnterpriseIntegrations() {
  return (
    <section
      id="integraciones"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="integrations-heading"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <SectionEyebrow className="mb-3">Stack técnico</SectionEyebrow>
          <h2
            id="integrations-heading"
            className="text-3xl font-display font-black tracking-tight text-gray-900"
          >
            Integrado con las mejores herramientas
          </h2>
          <p className="mt-3 text-base text-gray-500 max-w-lg mx-auto">
            Infraestructura enterprise-grade lista desde el día uno.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {INTEGRATIONS.map(item => (
            <IntegrationLogo
              key={item.name}
              name={item.name}
              desc={item.desc}
              status={item.status as 'active' | 'soon'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
