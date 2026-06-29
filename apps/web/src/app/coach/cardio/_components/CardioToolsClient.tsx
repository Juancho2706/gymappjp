'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { HeartPulse, Timer, LayoutGrid, Pencil, ChevronDown } from 'lucide-react'
import {
    ageFromBirthDate,
    hrZonesFromMax,
    hrZonesKarvonen,
    maxHrClassic,
    maxHrTanaka,
    resolveClientZones,
} from '@/domain/cardio/zones'
import type { CardioProfile } from '@/domain/cardio/types'
import { formatDuration, formatPace, kmhFromPace, paceKmToMile, paceToTimeSec } from '@/domain/cardio/pace'
import { INTERVAL_TEMPLATES, intervalTotalDurationSec } from '@/lib/workout-interval'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'

export interface CardioClientVM {
    id: string
    full_name: string | null
    birth_date: string | null
    resting_hr: number | null
    max_hr_override: number | null
}

/** Identidad de zona Z1–Z5 (color del DS: recuperación aqua → VO2max danger). */
const ZONE_META: Record<number, { name: string; color: string }> = {
    1: { name: 'Recuperación', color: 'var(--aqua-500)' },
    2: { name: 'Base aeróbica', color: 'var(--success-500)' },
    3: { name: 'Tempo', color: 'var(--sport-500)' },
    4: { name: 'Umbral', color: 'var(--warning-500)' },
    5: { name: 'VO2max', color: 'var(--danger-500)' },
}

/** Tono de Badge para la zona sugerida de una plantilla. */
const TEMPLATE_ZONE_TONE: Record<number, BadgeTone> = {
    1: 'aqua',
    2: 'success',
    3: 'sport',
    4: 'warning',
    5: 'danger',
}

const INPUT_CLASS =
    'h-11 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-sm font-semibold text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] placeholder:text-subtle'

const FIELD_LABEL_CLASS = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted'

function parsePaceStr(str: string): number | null {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(str.trim())
    if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    const n = parseInt(str.trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
}

/** Fila de zona Z1–Z5: cuadrado de color + nombre + rango de bpm en mono. */
function ZoneRow({ zone, range, first }: { zone: number; range: string; first: boolean }) {
    const meta = ZONE_META[zone]
    return (
        <div
            className={`flex items-center gap-3 py-2.5 ${first ? '' : 'border-t border-subtle'}`}
        >
            <span
                className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] font-display text-xs font-extrabold text-white"
                style={{ background: meta.color }}
            >
                Z{zone}
            </span>
            <span className="flex-1 text-sm font-semibold text-strong">{meta.name}</span>
            <span className="font-mono text-[13px] font-bold tabular-nums text-body">{range}</span>
        </div>
    )
}

export function CardioToolsClient({ clients }: { clients: CardioClientVM[] }) {
    const [selectedId, setSelectedId] = useState<string>('')
    const [manualAge, setManualAge] = useState('30')
    const [manualResting, setManualResting] = useState('')
    const [paceStr, setPaceStr] = useState('5:00')
    const [distanceKm, setDistanceKm] = useState('5')

    const selected = clients.find((c) => c.id === selectedId) ?? null

    const zonesResult = useMemo(() => {
        if (selected) {
            const profile: CardioProfile = {
                birthDate: selected.birth_date,
                restingHr: selected.resting_hr,
                maxHrOverride: selected.max_hr_override,
            }
            return resolveClientZones(profile)
        }
        const age = parseInt(manualAge, 10)
        if (!Number.isFinite(age) || age <= 0 || age > 110) return null
        const maxHr = maxHrTanaka(age)
        const resting = parseInt(manualResting, 10)
        if (Number.isFinite(resting) && resting >= 25 && resting < maxHr) {
            return {
                maxHr,
                maxHrMethod: 'tanaka' as const,
                zoneMethod: 'karvonen' as const,
                restingHr: resting,
                zones: hrZonesKarvonen(maxHr, resting),
            }
        }
        return {
            maxHr,
            maxHrMethod: 'tanaka' as const,
            zoneMethod: 'percent_max' as const,
            restingHr: null,
            zones: hrZonesFromMax(maxHr),
        }
    }, [selected, manualAge, manualResting])

    const classicRef = useMemo(() => {
        const age = selected ? ageFromBirthDate(selected.birth_date) : parseInt(manualAge, 10)
        return age != null && Number.isFinite(age) && age > 0 && age <= 110 ? maxHrClassic(age) : null
    }, [selected, manualAge])

    const paceSec = parsePaceStr(paceStr)
    const distKm = parseFloat(distanceKm.replace(',', '.'))
    const paceValid = paceSec != null && Number.isFinite(distKm) && distKm > 0

    return (
        <div className="space-y-5">
            {/* ── Calculadora de zonas FC ── */}
            <Card padding="md" className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-control bg-aqua-100 text-aqua-700">
                        <HeartPulse className="size-[18px]" />
                    </span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-strong">Zonas de frecuencia cardiaca</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div>
                        <label htmlFor="cardio-client" className={FIELD_LABEL_CLASS}>Alumno</label>
                        <div className="relative">
                            <select
                                id="cardio-client"
                                value={selectedId}
                                onChange={(e) => setSelectedId(e.target.value)}
                                className={`${INPUT_CLASS} cursor-pointer appearance-none pr-9`}
                            >
                                <option value="">Cálculo manual</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.full_name ?? 'Sin nombre'}</option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                        </div>
                        {clients.length === 0 && (
                            <p className="mt-1.5 text-[11px] text-subtle">
                                Aún no tienes alumnos. Usa el cálculo manual o agrégalos desde Alumnos.
                            </p>
                        )}
                    </div>
                    {!selected && (
                        <>
                            <div>
                                <label htmlFor="cardio-age" className={FIELD_LABEL_CLASS}>Edad</label>
                                <input
                                    id="cardio-age"
                                    type="text"
                                    inputMode="numeric"
                                    value={manualAge}
                                    onChange={(e) => /^\d*$/.test(e.target.value) && setManualAge(e.target.value)}
                                    className={`${INPUT_CLASS} text-center`}
                                />
                            </div>
                            <div>
                                <label htmlFor="cardio-resting" className={FIELD_LABEL_CLASS}>
                                    FC reposo <span className="font-normal text-subtle">(opcional)</span>
                                </label>
                                <input
                                    id="cardio-resting"
                                    type="text"
                                    inputMode="numeric"
                                    value={manualResting}
                                    onChange={(e) => /^\d*$/.test(e.target.value) && setManualResting(e.target.value)}
                                    placeholder="60"
                                    className={`${INPUT_CLASS} text-center`}
                                />
                            </div>
                        </>
                    )}
                    {selected && (
                        <div className="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-3 py-2.5 md:col-span-2">
                            <p className="text-xs text-body">
                                {selected.birth_date
                                    ? `Edad ${ageFromBirthDate(selected.birth_date) ?? '—'} · FC reposo ${selected.resting_hr ?? '—'}${selected.max_hr_override ? ` · FCmax medida ${selected.max_hr_override}` : ''}`
                                    : 'Este alumno no tiene fecha de nacimiento registrada.'}
                            </p>
                            <Link
                                href={`/coach/cardio/${selected.id}`}
                                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-control border-[1.5px] border-[color:var(--brand)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--brand)] transition-colors hover:bg-sport-100 md:min-h-[36px]"
                            >
                                <Pencil className="size-3.5" />
                                Editar perfil
                            </Link>
                        </div>
                    )}
                </div>

                {zonesResult ? (
                    <div className="space-y-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-2xl font-black tabular-nums tracking-[-0.03em] text-strong">
                                {zonesResult.maxHr}
                                <span className="ml-1 text-[13px] font-semibold text-muted">bpm máx</span>
                            </span>
                            <span className="text-right text-[11px] font-semibold leading-tight text-subtle">
                                {zonesResult.maxHrMethod === 'override' ? 'FCmax medida' : 'Tanaka 208 − 0.7·edad'}
                                {classicRef != null && zonesResult.maxHrMethod !== 'override' && (
                                    <> · clásica {classicRef}</>
                                )}
                                <br />
                                rangos por {zonesResult.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zonesResult.restingHr})` : '%FCmax'}
                            </span>
                        </div>
                        <div>
                            {zonesResult.zones.map((z, i) => (
                                <ZoneRow key={z.zone} zone={z.zone} range={`${z.minBpm}–${z.maxBpm}`} first={i === 0} />
                            ))}
                        </div>
                    </div>
                ) : (
                    <Card padding="md" variant="sunken" className="text-center text-[13px] text-subtle">
                        {selected
                            ? 'Sin fecha de nacimiento ni FCmax medida no se pueden derivar zonas — edita el perfil del alumno.'
                            : 'Ingresa una edad válida para calcular las zonas.'}
                    </Card>
                )}
            </Card>

            {/* ── Calculadora de pace ── */}
            <Card padding="md" className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-control bg-sport-100 text-sport-700">
                        <Timer className="size-[18px]" />
                    </span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-strong">Pace · tiempo · velocidad</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                    <div>
                        <label htmlFor="pace-input" className={FIELD_LABEL_CLASS}>Pace (min/km)</label>
                        <input
                            id="pace-input"
                            type="text"
                            inputMode="numeric"
                            value={paceStr}
                            onChange={(e) => setPaceStr(e.target.value)}
                            placeholder="5:00"
                            className={`${INPUT_CLASS} text-center font-mono`}
                        />
                    </div>
                    <div>
                        <label htmlFor="distance-input" className={FIELD_LABEL_CLASS}>Distancia (km)</label>
                        <input
                            id="distance-input"
                            type="text"
                            inputMode="decimal"
                            value={distanceKm}
                            onChange={(e) => setDistanceKm(e.target.value)}
                            className={`${INPUT_CLASS} text-center font-mono`}
                        />
                    </div>
                </div>
                {paceValid && paceSec != null ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:max-w-2xl">
                        {[
                            ['Tiempo total', formatDuration(paceToTimeSec(paceSec, distKm))],
                            ['Velocidad', `${kmhFromPace(paceSec)} km/h`],
                            ['Pace por milla', `${formatPace(paceKmToMile(paceSec))} /mi`],
                            ['Pace por km', `${formatPace(paceSec)} /km`],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-control bg-surface-sunken p-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
                                <p className="mt-1.5 font-display text-xl font-black tabular-nums tracking-[-0.03em] text-strong">{value}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[13px] text-subtle">Pace en formato m:ss y distancia mayor a 0.</p>
                )}
            </Card>

            {/* ── Plantillas system de intervalos ── */}
            <Card padding="md" className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-control bg-surface-sunken text-muted">
                        <LayoutGrid className="size-[18px]" />
                    </span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-strong">Plantillas de intervalos</h2>
                </div>
                <p className="text-[13px] text-muted">
                    Disponibles en el builder al prescribir un bloque cardio (botón &quot;Aplicar plantilla&quot;).
                </p>
                <div className="grid gap-2.5 md:grid-cols-2">
                    {INTERVAL_TEMPLATES.map((tpl) => {
                        const total = intervalTotalDurationSec(tpl.config)
                        return (
                            <Card key={tpl.id} variant="outline" padding="md">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-bold text-strong">{tpl.name}</p>
                                    {tpl.suggestedHrZone && (
                                        <Badge tone={TEMPLATE_ZONE_TONE[tpl.suggestedHrZone] ?? 'sport'} variant="soft" size="sm">
                                            Z{tpl.suggestedHrZone}
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-1 text-[13px] text-muted">{tpl.description}</p>
                                <p className="mt-1.5 font-mono text-[11px] text-subtle">
                                    {tpl.suggestedHrZone ? `Zona sugerida Z${tpl.suggestedHrZone}` : 'Sin zona sugerida'}
                                    {total > 0 ? ` · ~${formatDuration(total)} cronometrables` : ' · por distancia'}
                                </p>
                            </Card>
                        )
                    })}
                </div>
            </Card>
        </div>
    )
}
