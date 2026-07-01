import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { HeartPulse } from 'lucide-react'
import { getCardioPageData } from './_data/cardio.queries'
import { CardioToolsClient } from './_components/CardioToolsClient'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'

export const metadata: Metadata = { title: 'Cardio | EVA' }

/**
 * Módulo cardio (key `cardio`, toggleable — specs/movida-entrenamiento F7).
 * Gating SERVER-SIDE en _data (assertModule por workspace activo): con OFF se
 * muestra el aviso y ninguna action del módulo es ejecutable (AC7).
 */
export default async function CardioPage() {
    const data = await getCardioPageData()
    if (data.status === 'unauthenticated') redirect('/login')

    if (data.status === 'module_off') {
        return <ModuleOffNotice moduleKey="cardio" />
    }

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
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
            <CardioToolsClient
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
