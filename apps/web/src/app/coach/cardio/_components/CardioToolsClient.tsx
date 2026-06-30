'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Pencil } from 'lucide-react'
import {
    ageFromBirthDate,
    hrZonesFromMax,
    hrZonesKarvonen,
    maxHrTanaka,
    resolveClientZones,
} from '@/domain/cardio/zones'
import type { CardioProfile } from '@/domain/cardio/types'
import { formatDuration, formatPace, kmhFromPace, paceKmToMile, paceToTimeSec } from '@/domain/cardio/pace'
import { INTERVAL_TEMPLATES, intervalTotalDurationSec } from '@/lib/workout-interval'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { SegmentedControl } from '@/components/ui/segmented-control'

export interface CardioClientVM {
    id: string
    full_name: string | null
    birth_date: string | null
    resting_hr: number | null
    max_hr_override: number | null
    ref_5k_time_sec: number | null
}

/** Identidad de zona Z1–Z5 (color del DS: recuperación aqua → VO2max danger). */
const ZONE_META: Record<number, { name: string; color: string }> = {
    1: { name: 'Recuperación', color: 'var(--aqua-500)' },
    2: { name: 'Base aeróbica', color: 'var(--success-500)' },
    3: { name: 'Tempo', color: 'var(--sport-500)' },
    4: { name: 'Umbral', color: 'var(--warning-500)' },
    5: { name: 'VO₂ max', color: 'var(--danger-500)' },
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
    'h-[46px] w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-[15px] font-semibold text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] placeholder:text-subtle'

function parsePaceStr(str: string): number | null {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(str.trim())
    if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    const n = parseInt(str.trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
}

/** mm:ss desde segundos (referencia de 5K en el perfil del alumno). */
function formatRef5k(sec: number | null): string {
    if (sec == null || sec <= 0) return '—'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Fila de zona Z1–Z5: cuadrado de color + nombre + rango de bpm en mono. */
function ZoneRow({ zone, range, first }: { zone: number; range: string; first: boolean }) {
    const meta = ZONE_META[zone]
    return (
        <div className={`flex items-center gap-3 py-2.5 ${first ? '' : 'border-t border-subtle'}`}>
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

/** Tool · Zonas de frecuencia cardiaca (Tanaka + Karvonen, perfil real del alumno). */
function CardioZonesTool({ clients }: { clients: CardioClientVM[] }) {
    const [selectedId, setSelectedId] = useState<string>('')
    const [manualAge, setManualAge] = useState('40')
    const [manualResting, setManualResting] = useState('')

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

    return (
        <div className="space-y-3.5">
            {/* Selector de alumno + entrada manual / resumen del perfil */}
            <Card padding="md" className="space-y-3">
                <div>
                    <label htmlFor="cardio-client" className="mb-1.5 block text-[12.5px] font-bold text-strong">
                        Alumno
                    </label>
                    <div className="relative">
                        <select
                            id="cardio-client"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            className={`${INPUT_CLASS} cursor-pointer appearance-none pr-9`}
                        >
                            <option value="">Cálculo manual</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name ?? 'Sin nombre'}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    </div>
                    {clients.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-subtle">
                            Aún no tienes alumnos. Usa el cálculo manual o agrégalos desde Alumnos.
                        </p>
                    )}
                </div>

                {!selected && (
                    <div className="grid grid-cols-2 gap-2.5">
                        <div>
                            <label htmlFor="cardio-age" className="mb-1.5 block text-xs font-semibold text-muted">
                                Edad
                            </label>
                            <input
                                id="cardio-age"
                                type="text"
                                inputMode="numeric"
                                value={manualAge}
                                onChange={(e) => /^\d*$/.test(e.target.value) && setManualAge(e.target.value)}
                                className={INPUT_CLASS}
                            />
                        </div>
                        <div>
                            <label htmlFor="cardio-resting" className="mb-1.5 block text-xs font-semibold text-muted">
                                FC reposo <span className="font-normal text-subtle">(opc.)</span>
                            </label>
                            <input
                                id="cardio-resting"
                                type="text"
                                inputMode="numeric"
                                value={manualResting}
                                onChange={(e) => /^\d*$/.test(e.target.value) && setManualResting(e.target.value)}
                                placeholder="—"
                                className={INPUT_CLASS}
                            />
                        </div>
                    </div>
                )}

                {selected && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-control bg-surface-sunken px-3 py-2.5">
                        <span className="text-[12.5px] text-body">
                            Edad <b className="text-strong">{ageFromBirthDate(selected.birth_date) ?? '—'}</b>
                        </span>
                        <span className="text-[12.5px] text-body">
                            FC reposo <b className="text-strong">{selected.resting_hr ?? '—'}</b>
                        </span>
                        <span className="text-[12.5px] text-body">
                            FC máx <b className="text-strong">{selected.max_hr_override ?? '—'}</b>
                        </span>
                        <span className="text-[12.5px] text-body">
                            Ref 5K <b className="font-mono text-strong">{formatRef5k(selected.ref_5k_time_sec)}</b>
                        </span>
                    </div>
                )}
            </Card>

            {/* Resultado: FC máx + zonas, o estado vacío */}
            {zonesResult ? (
                <Card padding="md">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                        <span className="font-display text-2xl font-black tabular-nums tracking-[-0.03em] text-strong">
                            {zonesResult.maxHr}
                            <span className="ml-1 text-[13px] font-semibold text-muted">bpm máx</span>
                        </span>
                        <span className="text-right text-[11px] font-semibold leading-tight text-subtle">
                            {zonesResult.maxHrMethod === 'override' ? 'FC máx medida' : 'Tanaka'}
                            <br />
                            {zonesResult.zoneMethod === 'karvonen'
                                ? `Karvonen (reposo ${zonesResult.restingHr})`
                                : '%FC máx'}
                        </span>
                    </div>
                    <div>
                        {zonesResult.zones.map((z, i) => (
                            <ZoneRow key={z.zone} zone={z.zone} range={`${z.minBpm}–${z.maxBpm}`} first={i === 0} />
                        ))}
                    </div>
                    {selected && (
                        <Link
                            href={`/coach/cardio/${selected.id}`}
                            className="mt-3.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
                        >
                            <Pencil className="size-4" />
                            Editar perfil cardio
                        </Link>
                    )}
                </Card>
            ) : (
                <Card padding="lg" className="text-center text-[13.5px] text-subtle">
                    {selected ? (
                        <>
                            <div className="mb-3.5 leading-relaxed">
                                Sin edad ni FC máx no se pueden derivar zonas — completá el perfil del alumno.
                            </div>
                            <Link
                                href={`/coach/cardio/${selected.id}`}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-4 text-sm font-bold text-[color:var(--text-on-sport)] transition-opacity hover:opacity-90"
                            >
                                <Pencil className="size-4" />
                                Editar perfil cardio
                            </Link>
                        </>
                    ) : (
                        'Ingresá una edad válida para calcular las zonas.'
                    )}
                </Card>
            )}
        </div>
    )
}

/** Tool · Calculadora de pace / tiempo / velocidad. */
function CardioPaceTool() {
    const [paceStr, setPaceStr] = useState('5:00')
    const [distanceKm, setDistanceKm] = useState('5')

    const paceSec = parsePaceStr(paceStr)
    const distKm = parseFloat(distanceKm.replace(',', '.'))
    const paceValid = paceSec != null && Number.isFinite(distKm) && distKm > 0

    const paceInputClass =
        'h-[46px] w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-[15px] font-semibold font-mono text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] placeholder:text-subtle'

    return (
        <div className="space-y-3.5">
            <Card padding="md">
                <div className="grid grid-cols-2 gap-2.5">
                    <div>
                        <label htmlFor="pace-input" className="mb-1.5 block text-xs font-semibold text-muted">
                            Pace (min/km)
                        </label>
                        <input
                            id="pace-input"
                            type="text"
                            inputMode="numeric"
                            value={paceStr}
                            onChange={(e) => setPaceStr(e.target.value)}
                            placeholder="5:00"
                            className={paceInputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="distance-input" className="mb-1.5 block text-xs font-semibold text-muted">
                            Distancia (km)
                        </label>
                        <input
                            id="distance-input"
                            type="text"
                            inputMode="decimal"
                            value={distanceKm}
                            onChange={(e) => setDistanceKm(e.target.value)}
                            className={paceInputClass}
                        />
                    </div>
                </div>
            </Card>
            {paceValid && paceSec != null ? (
                <div className="grid grid-cols-2 gap-3">
                    {([
                        ['Tiempo total', formatDuration(paceToTimeSec(paceSec, distKm))],
                        ['Velocidad', `${kmhFromPace(paceSec)} km/h`],
                        ['Pace / milla', `${formatPace(paceKmToMile(paceSec))} /mi`],
                        ['Pace / km', `${formatPace(paceSec)} /km`],
                    ] as const).map(([label, value]) => (
                        <Card key={label} padding="md">
                            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
                            <div className="font-display text-[22px] font-black tabular-nums tracking-[-0.03em] text-strong">{value}</div>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card padding="lg" className="text-center text-[13.5px] text-subtle">
                    Pace en formato m:ss y distancia mayor a 0.
                </Card>
            )}
        </div>
    )
}

/** Tool · Plantillas del sistema (motor de intervalos real del builder). */
function CardioTemplatesTool() {
    return (
        <div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
                Plantillas del sistema. Se aplican al prescribir un bloque cardio en el builder.
            </p>
            <div className="flex flex-col gap-2.5">
                {INTERVAL_TEMPLATES.map((tpl) => {
                    const total = intervalTotalDurationSec(tpl.config)
                    return (
                        <Card key={tpl.id} padding="md">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[15px] font-bold text-strong">{tpl.name}</span>
                                {tpl.suggestedHrZone && (
                                    <Badge tone={TEMPLATE_ZONE_TONE[tpl.suggestedHrZone] ?? 'sport'} variant="soft" size="sm">
                                        Z{tpl.suggestedHrZone}
                                    </Badge>
                                )}
                            </div>
                            <div className="text-[13px] text-muted">{tpl.description}</div>
                            <div className="mt-1.5 font-mono text-[11.5px] text-subtle">
                                {total > 0 ? `~${formatDuration(total)} cronometrables` : 'por distancia'}
                            </div>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

export function CardioToolsClient({ clients }: { clients: CardioClientVM[] }) {
    const [tool, setTool] = useState<string>('Zonas')

    return (
        <div className="space-y-4">
            <SegmentedControl options={['Zonas', 'Pace', 'Plantillas']} value={tool} onChange={setTool} />
            {tool === 'Zonas' && <CardioZonesTool clients={clients} />}
            {tool === 'Pace' && <CardioPaceTool />}
            {tool === 'Plantillas' && <CardioTemplatesTool />}
        </div>
    )
}
