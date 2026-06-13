import type { Metadata } from 'next'
import { EnterpriseNav } from './_components/sections/EnterpriseNav'
import { EnterpriseHero } from './_components/sections/EnterpriseHero'
import { EnterpriseProblemStatement } from './_components/sections/EnterpriseProblemStatement'
import { EnterpriseFeatureBento } from './_components/sections/EnterpriseFeatureBento'
import { EnterpriseUseCases } from './_components/sections/EnterpriseUseCases'
import { EnterpriseROIComparison } from './_components/sections/EnterpriseROIComparison'
import { EnterprisePricing } from './_components/sections/EnterprisePricing'
import { EnterpriseTestimonials } from './_components/sections/EnterpriseTestimonials'
import { EnterpriseFAQ } from './_components/sections/EnterpriseFAQ'
import { EnterpriseFinalCTA } from './_components/sections/EnterpriseFinalCTA'
import { EnterpriseFooter } from './_components/sections/EnterpriseFooter'
import { EnterpriseMobileBottomBar } from './_components/sections/EnterpriseMobileBottomBar'

export const metadata: Metadata = {
  title: 'EVA Enterprise · Para Gyms y Academias',
  description:
    'Panel de operaciones para organizaciones con múltiples coaches. Pool de alumnos compartido, datos aislados por RLS, white-label por coach incluido.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'EVA Enterprise · Para Gyms y Academias',
    description:
      'Centraliza coaches, alumnos y reportes en un solo panel. White-label por coach incluido.',
    type: 'website',
  },
}

export default function EnterpriseLandingPage() {
  return (
    <div
      className="min-h-dvh overflow-x-clip"
      style={{ backgroundColor: '#ffffff', color: '#121212' }}
    >
      <EnterpriseNav />
      <main id="main-content">
        <EnterpriseHero />
        <EnterpriseProblemStatement />
        <EnterpriseFeatureBento />
        <EnterpriseUseCases />
        <EnterpriseROIComparison />
        <EnterprisePricing />
        <EnterpriseTestimonials />
        <EnterpriseFAQ />
        <EnterpriseFinalCTA />
      </main>
      <EnterpriseFooter />
      <EnterpriseMobileBottomBar />
    </div>
  )
}
