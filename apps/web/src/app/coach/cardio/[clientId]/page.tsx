import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, HeartPulse } from 'lucide-react'
import { getCardioClientData } from '../_data/cardio.queries'
import { CardioProfileForm } from '../_components/CardioProfileForm'
import { resolveClientZones } from '@/domain/cardio/zones'

export const metadata: Metadata = { title: 'Perfil cardio | EVA' }

interface Props {
    params: Promise<{ clientId: string }>
}

/**
 * Perfil cardio del alumno (vista del coach — ruta NUEVA, M4/F7).
 * El perfil del alumno general linkea acá ("Perfil cardio") — wiring central.
 */
export default async function CardioClientPage({ params }: Props) {
    const { clientId } = await params
    const data = await getCardioClientData(clientId)

    if (data.status === 'unauthenticated') redirect('/login')
    if (data.status === 'module_off') redirect('/coach/cardio')
    if (data.status === 'not_found') notFound()

    const { client } = data
    const zones = resolveClientZones({
        birthDate: client.birth_date,
        restingHr: client.resting_hr,
        maxHrOverride: client.max_hr_override,
    })

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 md:px-6">
            <header className="flex items-center gap-3">
                <Link
                    href="/coach/cardio"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Volver a Cardio"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <HeartPulse className="h-5 w-5 text-primary" />
                        Perfil cardio
                    </h1>
                    <p className="text-sm text-muted-foreground">{client.full_name ?? 'Alumno'}</p>
                </div>
            </header>

            <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
                <CardioProfileForm
                    client={{
                        id: client.id,
                        full_name: client.full_name,
                        birth_date: client.birth_date,
                        resting_hr: client.resting_hr,
                        max_hr_override: client.max_hr_override,
                        ref_5k_time_sec: client.ref_5k_time_sec,
                    }}
                />
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Zonas resultantes</h2>
                {zones ? (
                    <>
                        <p className="text-xs text-muted-foreground">
                            FCmax {zones.maxHr} bpm ({zones.maxHrMethod === 'override' ? 'medida' : 'Tanaka'}) ·{' '}
                            {zones.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zones.restingHr})` : '%FCmax'}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                            {zones.zones.map((z) => (
                                <div key={z.zone} className="rounded-lg border border-border p-2 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Z{z.zone}</p>
                                    <p className="text-sm font-bold tabular-nums text-foreground">{z.minBpm}–{z.maxBpm}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">
                            El alumno ve estos rangos en los bloques cardio con zona prescrita (&quot;Z4 · {zones.zones[3].minBpm}–{zones.zones[3].maxBpm} bpm&quot;).
                        </p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Sin fecha de nacimiento ni FCmax medida no se pueden derivar zonas — el alumno
                        verá solo la zona prescrita (&quot;Z4&quot;) sin bpm.
                    </p>
                )}
            </section>
        </div>
    )
}
