import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EvaBrandIcon } from '@/components/landing/LandingBrandMark'
import { readFailCount, CAPTCHA_THRESHOLD } from '@/lib/auth/fail-counter'
import { getTurnstileSiteKey } from '@/lib/auth/turnstile'
import { getAuthErrorMessage } from '@/lib/auth/error-messages'
import { CoachLoginForm } from './_components/CoachLoginForm'

interface CoachLoginPageProps {
    searchParams: Promise<{ error?: string }>
}

export default async function CoachLoginPage({ searchParams }: CoachLoginPageProps) {
    const params = await searchParams
    const failCount = await readFailCount('coach')
    const showCaptcha = failCount >= CAPTCHA_THRESHOLD
    const turnstileSiteKey = getTurnstileSiteKey()
    const urlError = getAuthErrorMessage(params.error, 'coach')

    return (
        <>
            {/* Volver al inicio — chevron atrás (diseño: header del flujo móvil) */}
            <Link
                href="/"
                aria-label="Volver al inicio"
                className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken text-text-strong transition-colors hover:bg-[color-mix(in_oklab,var(--surface-sunken)_88%,#000)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Link>

            <div className="w-full max-w-[360px]">
                {/* Encabezado centrado: logo EVA + título + subtítulo */}
                <div className="flex flex-col items-center text-center">
                    <EvaBrandIcon className="h-[72px] w-[72px] sm:h-[72px] sm:w-[72px]" />
                    <h1 className="mt-4 font-display text-[26px] font-black tracking-[-0.02em] text-text-strong">
                        Panel del coach
                    </h1>
                    <p className="mt-1 text-[14.5px] text-text-muted">
                        Entrá para gestionar tu marca y tus alumnos
                    </p>
                </div>

                <div className="mt-7">
                    <Suspense>
                        <CoachLoginForm
                            urlError={urlError}
                            showCaptcha={showCaptcha}
                            turnstileSiteKey={turnstileSiteKey}
                        />
                    </Suspense>
                </div>
            </div>
        </>
    )
}
