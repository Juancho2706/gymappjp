import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, HeartPulse } from 'lucide-react'
import { getCardioClientData } from '../_data/cardio.queries'
import { CardioProfileForm } from '../_components/CardioProfileForm'
import { resolveClientZones } from '@eva/cardio'

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
                    className="flex size-11 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-sunken hover:text-strong md:hidden"
                    aria-label="Volver a Cardio"
                >
                    <ArrowLeft className="size-5" />
                </Link>
                <div>
                    <h1 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-[-0.02em] text-strong">
                        <span className="inline-flex size-8 items-center justify-center rounded-control bg-sport-100 text-sport-600">
                            <HeartPulse className="size-[18px]" />
                        </span>
                        Perfil cardio
                    </h1>
                    <p className="text-sm text-muted">{client.full_name ?? 'Alumno'}</p>
                </div>
            </header>

            <section className="rounded-card border border-subtle bg-surface-card p-4 shadow-sm md:p-6">
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

            <section className="space-y-3 rounded-card border border-subtle bg-surface-card p-4 shadow-sm md:p-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-strong">Zonas resultantes</h2>
                {zones ? (
                    <>
                        <p className="text-xs text-muted">
                            FCmax {zones.maxHr} bpm ({zones.maxHrMethod === 'override' ? 'medida' : 'Tanaka'}) ·{' '}
                            {zones.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zones.restingHr})` : '%FCmax'}
                        </p>
                        <div>
                            {zones.zones.map((z, i) => {
                                const meta = ZONE_META[z.zone]
                                return (
                                    <div
                                        key={z.zone}
                                        className={`flex items-center gap-3 py-2.5 ${i === 0 ? '' : 'border-t border-subtle'}`}
                                    >
                                        <span
                                            className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] font-display text-xs font-extrabold text-white"
                                            style={{ background: meta.color }}
                                        >
                                            Z{z.zone}
                                        </span>
                                        <span className="flex-1 text-sm font-semibold text-strong">{meta.name}</span>
                                        <span className="font-mono text-[13px] font-bold tabular-nums text-body">{z.minBpm}–{z.maxBpm}</span>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="text-[11px] text-subtle">
                            El alumno ve estos rangos en los bloques cardio con zona prescrita (&ldquo;Z4 · {zones.zones[3].minBpm}–{zones.zones[3].maxBpm} bpm&rdquo;).
                        </p>
                    </>
                ) : (
                    <p className="text-xs text-muted">
                        Sin fecha de nacimiento ni FCmax medida no se pueden derivar zonas — el alumno
                        verá solo la zona prescrita (&quot;Z4&quot;) sin bpm.
                    </p>
                )}
            </section>
        </div>
    )
}

/** Identidad de zona Z1–Z5 (color del DS: recuperación aqua → VO2max danger). */
const ZONE_META: Record<number, { name: string; color: string }> = {
    1: { name: 'Recuperación', color: 'var(--aqua-500)' },
    2: { name: 'Base aeróbica', color: 'var(--success-500)' },
    3: { name: 'Tempo', color: 'var(--sport-500)' },
    4: { name: 'Umbral', color: 'var(--warning-500)' },
    5: { name: 'VO2max', color: 'var(--danger-500)' },
}
