import type { Metadata } from 'next'
import { EnterpriseLoginShell } from './_components/EnterpriseLoginShell'
import { EnterpriseAuthFooter } from './_components/EnterpriseAuthFooter'
import { EnterpriseTrustHeader } from './_components/EnterpriseTrustHeader'
import { OrgLoginForm } from './OrgLoginForm'
import { readFailCount, CAPTCHA_THRESHOLD } from '@/lib/auth/fail-counter'
import { getTurnstileSiteKey } from '@/lib/auth/turnstile'

export const metadata: Metadata = {
    title: 'Iniciar sesión · EVA Enterprise',
    description: 'Acceso al panel de administración de organizaciones EVA Enterprise.',
}

export default async function OrgLoginPage() {
    const failCount = await readFailCount('org')
    const showCaptcha = failCount >= CAPTCHA_THRESHOLD
    const turnstileSiteKey = getTurnstileSiteKey()

    return (
        <EnterpriseLoginShell topSlot={<EnterpriseTrustHeader />}>
            <OrgLoginForm showCaptcha={showCaptcha} turnstileSiteKey={turnstileSiteKey} />
            <EnterpriseAuthFooter />
        </EnterpriseLoginShell>
    )
}
