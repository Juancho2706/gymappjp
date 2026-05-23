import type { Metadata } from 'next'
import { EnterpriseLoginShell } from './_components/EnterpriseLoginShell'
import { EnterpriseAuthFooter } from './_components/EnterpriseAuthFooter'
import { OrgLoginForm } from './OrgLoginForm'

export const metadata: Metadata = {
  title: 'Iniciar sesión · EVA Enterprise',
  description: 'Acceso al panel de administración de organizaciones EVA Enterprise.',
}

export default function OrgLoginPage() {
  return (
    <EnterpriseLoginShell>
      <OrgLoginForm />
      <EnterpriseAuthFooter />
    </EnterpriseLoginShell>
  )
}
