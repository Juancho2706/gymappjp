'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { HeartPulse, Timer, Users, Pencil } from 'lucide-react'
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

export interface CardioClientVM {
    id: string
    full_name: string | null
    birth_date: string | null
    resting_hr: number | null
    max_hr_override: number | null
}

const ZONE_DESCRIPTIONS: Record<number, string> = {
    1: 'Recuperación',
    2: 'Base aeróbica',
    3: 'Tempo',
    4: 'Umbral',
    5: 'VO2max',
}

function parsePaceStr(str: string): number | null {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(str.trim())
    if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    const n = parseInt(str.trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
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
        <div className="space-y-6">
            {/* ── Calculadora de zonas FC ── */}
            <section className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <HeartPulse className="w-5 h-5 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Zonas de frecuencia cardiaca</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <label htmlFor="cardio-client" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alumno</label>
                        <select
                            id="cardio-client"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                        >
                            <option value="">Cálculo manual</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.full_name ?? 'Sin nombre'}</option>
                            ))}
                        </select>
                    </div>
                    {!selected && (
                        <>
                            <div className="space-y-1.5">
                                <label htmlFor="cardio-age" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Edad</label>
                                <input
                                    id="cardio-age"
                                    type="text"
                                    inputMode="numeric"
                                    value={manualAge}
                                    onChange={(e) => /^\d*$/.test(e.target.value) && setManualAge(e.target.value)}
                                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="cardio-resting" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">FC reposo (opcional)</label>
                                <input
                                    id="cardio-resting"
                                    type="text"
                                    inputMode="numeric"
                                    value={manualResting}
                                    onChange={(e) => /^\d*$/.test(e.target.value) && setManualResting(e.target.value)}
                                    placeholder="60"
                                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-sm font-semibold text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50"
                                />
                            </div>
                        </>
                    )}
                    {selected && (
                        <div className="md:col-span-2 flex items-end justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                            <p className="text-xs text-muted-foreground">
                                {selected.birth_date
                                    ? `Edad ${ageFromBirthDate(selected.birth_date) ?? '—'} · FC reposo ${selected.resting_hr ?? '—'}${selected.max_hr_override ? ` · FCmax medida ${selected.max_hr_override}` : ''}`
                                    : 'Este alumno no tiene fecha de nacimiento registrada.'}
                            </p>
                            <Link
                                href={`/coach/cardio/${selected.id}`}
                                className="flex min-h-[44px] items-center gap-1 rounded-lg border border-primary/40 px-3 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 md:min-h-[36px]"
                            >
                                <Pencil className="w-3 h-3" />
                                Editar perfil
                            </Link>
                        </div>
                    )}
                </div>

                {zonesResult ? (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                            FCmax <strong className="text-foreground">{zonesResult.maxHr} bpm</strong>{' '}
                            ({zonesResult.maxHrMethod === 'override' ? 'medida por el coach' : 'Tanaka 208 − 0.7·edad'})
                            {classicRef != null && zonesResult.maxHrMethod !== 'override' && (
                                <span className="text-muted-foreground/60"> · clásica 220−edad: {classicRef}</span>
                            )}
                            {' · '}rangos por {zonesResult.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zonesResult.restingHr})` : '%FCmax'}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                            {zonesResult.zones.map((z) => (
                                <div key={z.zone} className="rounded-lg border border-border p-2 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Z{z.zone}</p>
                                    <p className="text-sm font-bold tabular-nums text-foreground">{z.minBpm}–{z.maxBpm}</p>
                                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{ZONE_DESCRIPTIONS[z.zone]}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {selected
                            ? 'Sin fecha de nacimiento ni FCmax medida no se pueden derivar zonas — edita el perfil del alumno.'
                            : 'Ingresa una edad válida para calcular las zonas.'}
                    </p>
                )}
            </section>

            {/* ── Calculadora de pace ── */}
            <section className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Pace · tiempo · velocidad</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                    <div className="space-y-1.5">
                        <label htmlFor="pace-input" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pace (min/km)</label>
                        <input
                            id="pace-input"
                            type="text"
                            inputMode="numeric"
                            value={paceStr}
                            onChange={(e) => setPaceStr(e.target.value)}
                            placeholder="5:00"
                            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="distance-input" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Distancia (km)</label>
                        <input
                            id="distance-input"
                            type="text"
                            inputMode="decimal"
                            value={distanceKm}
                            onChange={(e) => setDistanceKm(e.target.value)}
                            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                        />
                    </div>
                </div>
                {paceValid && paceSec != null ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:max-w-2xl">
                        <div className="rounded-lg border border-border p-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Tiempo total</p>
                            <p className="font-bold tabular-nums">{formatDuration(paceToTimeSec(paceSec, distKm))}</p>
                        </div>
                        <div className="rounded-lg border border-border p-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Velocidad</p>
                            <p className="font-bold tabular-nums">{kmhFromPace(paceSec)} km/h</p>
                        </div>
                        <div className="rounded-lg border border-border p-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Pace por milla</p>
                            <p className="font-bold tabular-nums">{formatPace(paceKmToMile(paceSec))} /mi</p>
                        </div>
                        <div className="rounded-lg border border-border p-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Pace por km</p>
                            <p className="font-bold tabular-nums">{formatPace(paceSec)} /km</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">Pace en formato m:ss y distancia mayor a 0.</p>
                )}
            </section>

            {/* ── Plantillas system de intervalos ── */}
            <section className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Plantillas de intervalos</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                    Disponibles en el builder al prescribir un bloque cardio (botón &quot;Aplicar plantilla&quot;).
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                    {INTERVAL_TEMPLATES.map((tpl) => {
                        const total = intervalTotalDurationSec(tpl.config)
                        return (
                            <div key={tpl.id} className="rounded-xl border border-border p-3">
                                <p className="text-sm font-bold text-foreground">{tpl.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1">
                                    {tpl.suggestedHrZone ? `Zona sugerida Z${tpl.suggestedHrZone}` : 'Sin zona sugerida'}
                                    {total > 0 ? ` · ~${formatDuration(total)} cronometrables` : ' · por distancia'}
                                </p>
                            </div>
                        )
                    })}
                </div>
            </section>
        </div>
    )
}
