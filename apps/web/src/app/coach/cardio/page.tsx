import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { HeartPulse } from 'lucide-react'
import { getCardioPageData } from './_data/cardio.queries'
import { CardioToolsClient } from './_components/CardioToolsClient'
import { CardioFirstRunEmpty } from './_components/CardioFirstRunEmpty'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'
import { DomainOffNotice } from '@/components/coach/DomainOffNotice'
import { getCoachOnboardingEmptyContext } from '../_data/onboarding-empty.queries'

export const metadata: Metadata = { title: 'Cardio | EVA' }

/**
 * Módulo cardio (key `cardio`, toggleable — specs/movida-entrenamiento F7).
 * Gating SERVER-SIDE en _data (assertModule por workspace activo): con OFF se
 * muestra el aviso y ninguna action del módulo es ejecutable (AC7).
 *
 * Ola de orden W1.4b (mockup 3A): si el coach apagó el dominio en Opciones › Mi panel, la página
 * CONSERVA su encabezado y cambia solo el contenido por `DomainOffNotice` — así sabe dónde está
 * parado y que la pantalla existe, apagada por él. `module_off` sigue con su aviso de siempre.
 */
export default async function CardioPage() {
    const data = await getCardioPageData()
    if (data.status === 'unauthenticated') redirect('/login')

    if (data.status === 'module_off') {
        return <ModuleOffNotice moduleKey="cardio" />
    }

    if (data.status === 'domain_off') {
        return (
            <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
                <CardioPageHeader />
                <DomainOffNotice domain="cardio" />
            </div>
        )
    }

    // Primer uso = ningún alumno tiene todavía datos de los que salgan zonas. Con el alumno de
    // ejemplo sembrado la lista NO está vacía, así que «vacío» acá es «sin perfil cargado»,
    // no «sin alumnos» (SPEC coach-onboarding-v2 §7).
    const onboarding = await getCoachOnboardingEmptyContext()
    const hasCardioProfile = data.clients.some(
        (c) => c.resting_hr != null || c.max_hr_override != null || c.ref_5k_time_sec != null,
    )

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
            <CardioPageHeader />
            {!hasCardioProfile && (
                <CardioFirstRunEmpty
                    demoClientId={onboarding.demoClientId}
                    demoName={onboarding.demoName}
                    demoLabel={onboarding.demoLabel}
                    noun={onboarding.noun}
                    firstClientId={data.clients[0]?.id ?? null}
                />
            )}
            <CardioToolsClient
                demoClientId={onboarding.demoClientId}
                demoLabel={onboarding.demoLabel}
                clients={data.clients.map((c) => ({
                    id: c.id,
                    full_name: c.full_name,
                    birth_date: c.birth_date,
                    resting_hr: c.resting_hr,
                    max_hr_override: c.max_hr_override,
                    ref_5k_time_sec: c.ref_5k_time_sec,
                }))}
            />
        </div>
    )
}

/**
 * Encabezado de la página (♥ Cardio · pastilla «Módulo» · «Herramientas»). Extraído para que la
 * rama `domain_off` pinte EXACTAMENTE el mismo chasis que la página viva (mockup 3A): un solo
 * lugar que editar cuando cambie el título.
 */
function CardioPageHeader() {
    return (
        <header className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.02em] text-strong">
                    <span className="inline-flex size-9 items-center justify-center rounded-control bg-sport-100 text-sport-600">
                        <HeartPulse className="size-5" />
                    </span>
                    Cardio
                </h1>
                <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-sport-100 px-2.5 text-[12px] font-bold text-sport-700">
                    Módulo
                </span>
            </div>
            <p className="text-[12.5px] text-muted">Herramientas</p>
        </header>
    )
}
