import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { HeartPulse } from 'lucide-react'
import { getCardioPageData } from './_data/cardio.queries'
import { CardioToolsClient } from './_components/CardioToolsClient'

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
        return (
            <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <HeartPulse className="h-8 w-8" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Módulo cardio no habilitado</h1>
                <p className="text-sm text-muted-foreground">
                    Las zonas de FC personalizadas, la calculadora de pace y las plantillas de
                    intervalos son parte del módulo cardio. Pide su activación para tu cuenta o equipo.
                </p>
                <Link
                    href="/coach/dashboard"
                    className="flex min-h-[44px] items-center rounded-xl bg-primary px-6 text-xs font-bold uppercase tracking-widest text-primary-foreground"
                >
                    Volver al dashboard
                </Link>
            </div>
        )
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
