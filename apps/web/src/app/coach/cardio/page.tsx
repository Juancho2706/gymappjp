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
            <header className="space-y-1">
                <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
                    <HeartPulse className="h-5 w-5 text-primary" />
                    Cardio
                </h1>
                <p className="text-sm text-muted-foreground">
                    Zonas de frecuencia cardiaca personalizadas, calculadora de pace y plantillas de
                    intervalos. La prescripción guarda la <strong>zona</strong>; los bpm se calculan
                    por alumno al renderizar.
                </p>
            </header>
            <CardioToolsClient
                clients={data.clients.map((c) => ({
                    id: c.id,
                    full_name: c.full_name,
                    birth_date: c.birth_date,
                    resting_hr: c.resting_hr,
                    max_hr_override: c.max_hr_override,
                }))}
            />
        </div>
    )
}
