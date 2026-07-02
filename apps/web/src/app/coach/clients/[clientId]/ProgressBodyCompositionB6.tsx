'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { PhotoComparisonSlider } from '@/components/coach/PhotoComparisonSlider'
import { MetricInfo, type MetricTerm } from '@/components/ui/metric-info'
import {
    avgEnergySince,
    bmiCategory,
    bmiFromMetric,
    linearRegressionKgPerDay,
    projectedWeightRangeKg,
} from './profileBodyCompositionUtils'
import { Scale, Star, Images, Ruler } from 'lucide-react'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { BiaTrendPanel } from './bodycomp/_components/BiaTrendPanel'
import { IsakTrendPanel } from './bodycomp/_components/IsakTrendPanel'
import { SectionTitle } from './_components/SectionTitle'

export type BodyCompCheckInRow = {
    id: string
    created_at: string
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    front_photo_url?: string | null
}

type ProgressBodyCompositionB6Props = {
    checkIns: BodyCompCheckInRow[]
    heightCm: number | null | undefined
    /** Peso objetivo del alumno (clients.goal_weight_kg). Dibuja la línea punteada
     *  + leyenda en la curva de peso. El editor vive en el dashboard padre. */
    goalWeight?: number | null
    /** ID del alumno — necesario para reusar los TrendPanels (acción de borrar medición). */
    clientId?: string
    /** Composición corporal (standalone-only; vacío en team/enterprise por diseño de consentimiento
     *  Ley 21.719). Series SEPARADAS por método — nunca se mezclan (%grasa BIA vs ISAK no comparables). */
    bodyComposition?: { bia: BodyCompositionRow[]; isak: BodyCompositionRow[] }
    /** Entitlement del módulo Composición corporal (espejo del gate server-side hasModule).
     *  false ⇒ teaser bloqueado; true ⇒ dato real. NO se basa en si hay filas (el fetch trae por
     *  RLS aunque el coach no pague). */
    bodycompEnabled?: boolean
    // Props de color heredados (recharts) — la curva ahora es SVG nativo del diseño
    // nuevo, pero se conservan en el contrato para no romper el call site del padre.
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
}

/* ---- Estrellas de energía (ember rellenas / ink-200 vacías) ---- */
function EnergyStars({ level }: { level: number | null | undefined }) {
    const filled = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
    return (
        <span className="inline-flex items-center gap-0.5" aria-label={`Energía ${level ?? 0} de 10`}>
            {[1, 2, 3, 4, 5].map((k) => {
                const on = k <= filled
                return (
                    <Star
                        key={k}
                        className="h-[13px] w-[13px]"
                        style={{
                            color: on ? 'var(--ember-500)' : 'var(--ink-200)',
                            fill: on ? 'var(--ember-500)' : 'transparent',
                        }}
                    />
                )
            })}
        </span>
    )
}

/* ---- Gauge semicircular (transcrito verbatim del diseño) ---- */
function Gauge({ pct, color }: { pct: number; color: string }) {
    const r = 34
    const c = Math.PI * r
    const off = c * (1 - pct / 100)
    return (
        <svg viewBox="0 0 80 46" style={{ width: 100, height: 58 }}>
            <path
                d="M 6 40 A 34 34 0 0 1 74 40"
                fill="none"
                stroke="var(--surface-sunken)"
                strokeWidth="8"
                strokeLinecap="round"
            />
            <path
                d="M 6 40 A 34 34 0 0 1 74 40"
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={off}
            />
        </svg>
    )
}

const pgSel: CSSProperties = {
    width: '100%',
    height: 38,
    padding: '0 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--border-default)',
    background: 'var(--surface-card)',
    fontSize: 13,
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-ui)',
}

/* ---- Teaser bloqueado (módulo Composición corporal OFF) ---------------------
   Preview difuminado (curva fake, no datos reales) + overlay con CTA. Copy neutro
   sin precio (anti-hostigamiento, espejo de MODULE_COPY.body_composition). */
function CompositionTeaser() {
    return (
        <Card padding="md">
            <SectionTitle style={{ margin: 0 }}>Composición corporal</SectionTitle>
            <div className="relative mt-2 overflow-hidden rounded-[var(--radius-md)]">
                {/* Preview fake difuminado — nunca datos reales bajo teaser */}
                <div
                    className="select-none pointer-events-none blur-sm"
                    aria-hidden
                    style={{ opacity: 0.55 }}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        {[
                            { l: '% Grasa', v: '18.4%' },
                            { l: 'Masa muscular', v: '34.2 kg' },
                        ].map((b) => (
                            <div
                                key={b.l}
                                style={{
                                    background: 'var(--surface-sunken)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '8px 10px',
                                }}
                            >
                                <div
                                    className="font-display font-black tracking-tight tabular-nums text-strong"
                                    style={{ fontSize: 15 }}
                                >
                                    {b.v}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {b.l}
                                </div>
                            </div>
                        ))}
                    </div>
                    <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ width: '100%', height: 70, display: 'block' }}
                    >
                        <polyline
                            points="0,70 20,52 40,58 60,38 80,44 100,26"
                            fill="none"
                            stroke="var(--sport-500)"
                            strokeWidth="2.5"
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
                {/* Overlay CTA */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                            width: 42,
                            height: 42,
                            background: 'var(--surface-card)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-muted)',
                        }}
                    >
                        <Ruler className="h-5 w-5" />
                    </div>
                    <div className="font-display font-extrabold text-strong" style={{ fontSize: 14 }}>
                        Composición corporal
                    </div>
                    <p className="text-muted" style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.35 }}>
                        %Grasa, masa muscular y antropometría (protocolo ISAK). Parte del módulo
                        Composición corporal.
                    </p>
                    <Link
                        href="/coach/settings/modules"
                        className="mt-1 inline-flex min-h-9 items-center rounded-control bg-[var(--cta-fill)] px-4 text-xs font-bold text-[color:var(--text-on-sport)] transition-opacity hover:opacity-90"
                    >
                        Desbloquear
                    </Link>
                </div>
            </div>
        </Card>
    )
}

/* ---- Sección Composición corporal (dato real, entitlement ON) ----------------
   Reusa BiaTrendPanel/IsakTrendPanel (curvas recharts + delta + lista). SegmentedControl
   BIA/ISAK; series NUNCA mezcladas. Empty-state si no hay mediciones. */
function CompositionSection({
    clientId,
    bia,
    isak,
}: {
    clientId?: string
    bia: BodyCompositionRow[]
    isak: BodyCompositionRow[]
}) {
    const hasBia = bia.length > 0
    const hasIsak = isak.length > 0
    // Default al método que tenga datos (BIA prioritario).
    const [method, setMethod] = useState<'bia' | 'isak'>(hasBia ? 'bia' : hasIsak ? 'isak' : 'bia')

    if (!hasBia && !hasIsak) {
        return (
            <Card padding="md">
                <SectionTitle style={{ margin: 0 }}>Composición corporal</SectionTitle>
                <div className="mt-2 flex items-start gap-2 text-sm text-muted">
                    <Ruler className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Sin mediciones todavía. Captura bioimpedancia o antropometría (ISAK) desde el
                        {clientId ? (
                            <>
                                {' '}
                                <Link
                                    href={`/coach/clients/${clientId}/bodycomp`}
                                    className="font-semibold text-sport-600 underline-offset-2 hover:underline"
                                >
                                    módulo Composición corporal
                                </Link>
                                .
                            </>
                        ) : (
                            ' módulo Composición corporal.'
                        )}
                    </span>
                </div>
            </Card>
        )
    }

    return (
        <Card padding="md">
            <SectionTitle style={{ margin: 0 }}>Composición corporal</SectionTitle>
            {hasBia && hasIsak && (
                <div className="mt-2">
                    <SegmentedControl
                        options={[
                            { value: 'bia', label: 'Bioimpedancia' },
                            { value: 'isak', label: 'Antropometría' },
                        ]}
                        value={method}
                        onChange={(v) => setMethod(v as 'bia' | 'isak')}
                    />
                </div>
            )}
            <div className="mt-3">
                {(hasBia && (method === 'bia' || !hasIsak)) ? (
                    <BiaTrendPanel clientId={clientId ?? ''} rows={bia} />
                ) : (
                    <IsakTrendPanel clientId={clientId ?? ''} rows={isak} />
                )}
            </div>
        </Card>
    )
}

export function ProgressBodyCompositionB6({
    checkIns,
    heightCm,
    goalWeight,
    clientId,
    bodyComposition,
    bodycompEnabled = false,
}: ProgressBodyCompositionB6Props) {
    const [dotDetail, setDotDetail] = useState<BodyCompCheckInRow | null>(null)
    const [compareOpen, setCompareOpen] = useState(false)
    const [baseId, setBaseId] = useState<string>('')
    const [compareToId, setCompareToId] = useState<string>('')

    const sortedAsc = useMemo(
        () =>
            [...(checkIns || [])].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            ),
        [checkIns]
    )

    const sortedDesc = useMemo(() => [...sortedAsc].reverse(), [sortedAsc])

    const withWeight = useMemo(
        () => sortedAsc.filter((c) => c.weight != null && Number(c.weight) > 0),
        [sortedAsc]
    )

    // ---- Geometría SVG de la curva de peso (normalización 0–100 del diseño) ----
    const weights = useMemo(() => withWeight.map((c) => Number(c.weight)), [withWeight])
    const n = weights.length
    const mn = n ? Math.min(...weights) : 0
    const mx = n ? Math.max(...weights) : 0
    const span = mx - mn || 1
    const coords = useMemo(
        () =>
            withWeight.map((c, i) => ({
                x: n > 1 ? (i / (n - 1)) * 100 : 50,
                y: 100 - ((Number(c.weight) - mn) / span) * 82 - 9,
                ci: c,
            })),
        [withWeight, n, mn, span]
    )
    const pts = coords.map((p) => `${p.x},${p.y}`).join(' ')

    const firstW = withWeight[0]
    const lastW = withWeight[withWeight.length - 1]
    const firstWeight = firstW?.weight != null ? Number(firstW.weight) : null
    const lastWeight = lastW?.weight != null ? Number(lastW.weight) : null
    const totalDelta =
        firstWeight != null && lastWeight != null ? lastWeight - firstWeight : null

    // Variación de los últimos ~7 días (peso actual vs check-in de hace ≥7 días).
    const delta7d = useMemo(() => {
        if (withWeight.length < 2 || lastW?.weight == null) return null
        const lastT = new Date(lastW.created_at).getTime()
        const sevenAgo = lastT - 7 * 86_400_000
        let baseline: BodyCompCheckInRow | undefined
        for (let i = withWeight.length - 1; i >= 0; i--) {
            if (new Date(withWeight[i]!.created_at).getTime() <= sevenAgo) {
                baseline = withWeight[i]
                break
            }
        }
        if (!baseline) baseline = withWeight[0]
        if (!baseline || baseline.id === lastW.id || baseline.weight == null) return null
        return Number((Number(lastW.weight) - Number(baseline.weight)).toFixed(1))
    }, [withWeight, lastW])

    const slopeKgPerDay = useMemo(() => linearRegressionKgPerDay(checkIns), [checkIns])
    const monthlyRate = slopeKgPerDay * 30
    const projected4wRange = useMemo(
        () => projectedWeightRangeKg(lastWeight, slopeKgPerDay, 4, 7),
        [lastWeight, slopeKgPerDay]
    )

    const goalY =
        goalWeight != null && n > 0
            ? Math.max(4, Math.min(96, 100 - ((goalWeight - mn) / span) * 82 - 9))
            : null

    const bmi =
        lastW?.weight != null && heightCm ? bmiFromMetric(Number(lastW.weight), heightCm) : null
    const bmiCat = bmi != null ? bmiCategory(bmi) : null
    const bmiPct =
        bmi != null ? Math.max(0, Math.min(100, ((bmi - 16) / (36 - 16)) * 100)) : 50
    // Altura mostrada: cm normalizado (algunos perfiles guardan metros).
    const heightDisplay =
        heightCm != null && heightCm > 0 ? (heightCm < 3 ? Math.round(heightCm * 100) : heightCm) : null

    const avgEnergy7 = useMemo(
        () => avgEnergySince(checkIns, subDays(new Date(), 7)),
        [checkIns]
    )
    const energyPct = avgEnergy7 != null ? Math.max(0, Math.min(100, avgEnergy7 * 10)) : 0
    const energyColor =
        energyPct >= 70
            ? 'var(--success-500)'
            : energyPct >= 40
              ? 'var(--warning-500)'
              : 'var(--danger-500)'

    const photoCheckIns = useMemo(
        () => sortedAsc.filter((c) => c.front_photo_url),
        [sortedAsc]
    )

    useEffect(() => {
        if (photoCheckIns.length === 0) {
            setBaseId('')
            setCompareToId('')
            return
        }
        const first = photoCheckIns[0]!
        const last = photoCheckIns[photoCheckIns.length - 1]!
        setBaseId((prev) => (prev && photoCheckIns.some((p) => p.id === prev) ? prev : first.id))
        setCompareToId((prev) =>
            prev && photoCheckIns.some((p) => p.id === prev) ? prev : last.id
        )
    }, [photoCheckIns])

    const baseCi = photoCheckIns.find((c) => c.id === baseId)
    const compareCi = photoCheckIns.find((c) => c.id === compareToId)
    const dW =
        baseCi?.weight != null && compareCi?.weight != null
            ? Number((Number(compareCi.weight) - Number(baseCi.weight)).toFixed(1))
            : null
    const dE =
        baseCi?.energy_level != null && compareCi?.energy_level != null
            ? Number(compareCi.energy_level) - Number(baseCi.energy_level)
            : null

    if (!checkIns?.length) {
        return (
            <Card padding="lg">
                <div className="flex items-center gap-2 text-sm font-medium text-muted">
                    <Scale className="h-4 w-4 shrink-0" />
                    Sin check-ins todavía. La composición y tendencias aparecerán cuando el alumno
                    registre peso y fotos.
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-3.5">
            {/* ── Peso · tendencia + statboxes ───────────────────────────── */}
            <Card padding="md">
                <div className="flex items-end justify-between" style={{ marginBottom: 6 }}>
                    <SectionTitle style={{ margin: 0 }}>Peso · tendencia</SectionTitle>
                    <div className="text-right">
                        <span
                            className="font-display font-black tracking-tight tabular-nums text-strong"
                            style={{ fontSize: 22 }}
                        >
                            {lastWeight != null ? lastWeight.toFixed(1) : '—'}
                            <span style={{ fontSize: 12 }}>kg</span>
                        </span>
                        {delta7d != null && (
                            <span
                                className="ml-2 font-bold"
                                style={{
                                    fontSize: 13,
                                    color: delta7d <= 0 ? 'var(--success-600)' : 'var(--ember-700)',
                                }}
                            >
                                {delta7d >= 0 ? '+' : ''}
                                {delta7d} kg
                            </span>
                        )}
                    </div>
                </div>

                {n > 1 ? (
                    <>
                        <div style={{ position: 'relative', width: '100%', height: 90 }}>
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                style={{ width: '100%', height: 90, display: 'block' }}
                            >
                                {goalY != null && (
                                    <line
                                        x1="0"
                                        y1={goalY}
                                        x2="100"
                                        y2={goalY}
                                        stroke="var(--success-500)"
                                        strokeWidth="1"
                                        strokeDasharray="3 3"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                )}
                                <polyline
                                    points={pts}
                                    fill="none"
                                    stroke="var(--sport-500)"
                                    strokeWidth="2.5"
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            </svg>
                            {coords.map((p, i) => (
                                <button
                                    key={p.ci.id}
                                    aria-label={`Peso ${p.ci.weight} kg`}
                                    onClick={() => setDotDetail(p.ci)}
                                    style={{
                                        position: 'absolute',
                                        left: `calc(${p.x}% - 7px)`,
                                        top: `calc(${p.y}% - 7px)`,
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        border: '2px solid var(--sport-500)',
                                        background: 'var(--surface-card)',
                                        padding: 0,
                                        cursor: 'pointer',
                                        boxShadow: 'var(--shadow-xs)',
                                    }}
                                />
                            ))}
                        </div>
                        {goalWeight != null && (
                            <div
                                className="flex items-center text-muted"
                                style={{ gap: 6, margin: '6px 0 12px', fontSize: 11.5 }}
                            >
                                <span
                                    style={{
                                        width: 14,
                                        height: 0,
                                        borderTop: '1.5px dashed var(--success-500)',
                                    }}
                                />
                                Objetivo · {goalWeight} kg
                            </div>
                        )}
                    </>
                ) : (
                    <div
                        className="flex items-center justify-center text-sm text-muted"
                        style={{ height: 90, marginBottom: 12 }}
                    >
                        Hace falta al menos dos pesos para la curva.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {([
                        { l: 'Inicial', v: firstWeight != null ? `${firstWeight.toFixed(1)} kg` : '—' },
                        {
                            l: 'Cambio total',
                            v:
                                totalDelta != null
                                    ? `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)} kg`
                                    : '—',
                            c:
                                totalDelta != null
                                    ? totalDelta <= 0
                                        ? 'var(--success-600)'
                                        : 'var(--ember-700)'
                                    : undefined,
                        },
                        {
                            l: 'Ritmo 30d',
                            sub: 'regresión',
                            term: 'regresion' as MetricTerm,
                            v: `${monthlyRate >= 0 ? '+' : ''}${monthlyRate.toFixed(1)} kg`,
                        },
                        {
                            l: 'Proyección 4 sem',
                            term: 'proyeccion' as MetricTerm,
                            v:
                                projected4wRange != null && withWeight.length >= 2
                                    ? projected4wRange.low === projected4wRange.high
                                        ? `${projected4wRange.point.toFixed(1)} kg`
                                        : `${projected4wRange.low.toFixed(1)}–${projected4wRange.high.toFixed(1)} kg`
                                    : '—',
                            badge:
                                projected4wRange != null && withWeight.length >= 2
                                    ? 'estimado'
                                    : undefined,
                            hint:
                                projected4wRange != null && withWeight.length >= 2
                                    ? 'extrapolación lineal, no una promesa'
                                    : undefined,
                        },
                        {
                            l: 'Energía media',
                            sub: '7 días',
                            v: avgEnergy7 != null ? `${avgEnergy7.toFixed(1)}/10` : '—',
                        },
                    ] as {
                        l: string
                        v: string
                        c?: string
                        sub?: string
                        badge?: string
                        hint?: string
                        term?: MetricTerm
                    }[]).map((b) => (
                        <div
                            key={b.l}
                            style={{
                                background: 'var(--surface-sunken)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '8px 10px',
                            }}
                        >
                            <div
                                className="flex items-center gap-1.5"
                                style={{ flexWrap: 'wrap' }}
                            >
                                <span
                                    className="font-display font-black tracking-tight tabular-nums"
                                    style={{ fontSize: 15, color: b.c || 'var(--text-strong)', lineHeight: 1.1 }}
                                >
                                    {b.v}
                                </span>
                                {b.badge ? (
                                    <span
                                        className="font-semibold uppercase"
                                        style={{
                                            fontSize: 8.5,
                                            letterSpacing: '0.04em',
                                            padding: '1px 5px',
                                            borderRadius: 'var(--radius-xs)',
                                            background: 'var(--surface-card)',
                                            color: 'var(--text-muted)',
                                            border: '1px solid var(--border-subtle)',
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {b.badge}
                                    </span>
                                ) : null}
                                {b.term ? (
                                    <MetricInfo term={b.term} iconClassName="opacity-60" />
                                ) : null}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {b.l}
                                {b.sub ? ' · ' + b.sub : ''}
                            </div>
                            {b.hint ? (
                                <div
                                    style={{
                                        fontSize: 9,
                                        color: 'var(--text-subtle)',
                                        marginTop: 3,
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {b.hint}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </Card>

            {/* ── IMC + Energía media (gauge) ────────────────────────────── */}
            <div className="grid grid-cols-1 gap-3.5 @4xl/ficha:grid-cols-2">
                <Card padding="md">
                    <div
                        className="flex items-baseline justify-between"
                        style={{ marginBottom: 10 }}
                    >
                        <SectionTitle style={{ margin: 0 }}>
                            <span className="inline-flex items-center gap-1">
                                IMC
                                <MetricInfo term="imc" iconClassName="opacity-60" />
                            </span>
                        </SectionTitle>
                        {bmi != null && (
                            <div>
                                <span
                                    className="font-display font-black tracking-tight tabular-nums text-strong"
                                    style={{ fontSize: 22 }}
                                >
                                    {bmi.toFixed(1)}
                                </span>
                                <span
                                    className="ml-2 font-bold"
                                    style={{
                                        fontSize: 13,
                                        color:
                                            bmiCat === 'Normal'
                                                ? 'var(--success-600)'
                                                : 'var(--ember-700)',
                                    }}
                                >
                                    {bmiCat}
                                </span>
                            </div>
                        )}
                    </div>
                    {bmi == null ? (
                        <p className="text-sm text-muted">
                            Añade altura en la ficha del alumno (intake) para ver IMC y la escala.
                        </p>
                    ) : (
                        <>
                            <div
                                style={{
                                    position: 'relative',
                                    height: 8,
                                    borderRadius: 999,
                                    marginBottom: 6,
                                    background:
                                        'linear-gradient(90deg, var(--sport-300) 0%, var(--success-500) 30%, var(--warning-500) 65%, var(--danger-500) 100%)',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: -3,
                                        left: `calc(${bmiPct}% - 7px)`,
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        background: '#fff',
                                        border: '2px solid var(--text-strong)',
                                        boxShadow: 'var(--shadow-sm)',
                                    }}
                                />
                            </div>
                            <div
                                className="flex justify-between"
                                style={{
                                    fontSize: 10,
                                    color: 'var(--text-subtle)',
                                    fontFamily: 'var(--font-mono)',
                                }}
                            >
                                <span>16</span>
                                <span>18.5</span>
                                <span>25</span>
                                <span>30</span>
                                <span>36</span>
                            </div>
                            {heightDisplay != null && (
                                <div
                                    style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}
                                >
                                    Altura {heightDisplay} cm · de la ficha intake
                                </div>
                            )}
                        </>
                    )}
                </Card>

                <Card padding="md">
                    <SectionTitle>Energía media · 7 días</SectionTitle>
                    {avgEnergy7 == null ? (
                        <p className="text-sm text-muted">
                            Sin niveles de energía en la última semana.
                        </p>
                    ) : (
                        <div className="flex items-center justify-center" style={{ gap: 18 }}>
                            <Gauge pct={energyPct} color={energyColor} />
                            <div>
                                <div
                                    className="font-display font-black tracking-tight tabular-nums text-strong"
                                    style={{ fontSize: 26 }}
                                >
                                    {avgEnergy7.toFixed(1)}
                                    <span style={{ fontSize: 13 }}>/10</span>
                                </div>
                                <div className="flex" style={{ gap: 2, marginTop: 2 }}>
                                    <EnergyStars level={avgEnergy7} />
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Composición corporal (grasa% · músculo · tendencia) ────── */}
            {bodycompEnabled ? (
                <CompositionSection
                    clientId={clientId}
                    bia={bodyComposition?.bia ?? []}
                    isak={bodyComposition?.isak ?? []}
                />
            ) : (
                <CompositionTeaser />
            )}

            {/* ── Comparativa de fotos ───────────────────────────────────── */}
            {photoCheckIns.length >= 2 && (
                <Card padding="md">
                    <SectionTitle>Comparativa de fotos</SectionTitle>
                    <div className="flex" style={{ gap: 10, marginBottom: 10 }}>
                        <label style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                Base
                            </div>
                            <select
                                value={baseId}
                                onChange={(e) => setBaseId(e.target.value)}
                                style={pgSel}
                            >
                                {photoCheckIns.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {format(new Date(c.created_at), 'd MMM yyyy')} ·{' '}
                                        {c.weight != null ? `${c.weight} kg` : '—'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                Comparar
                            </div>
                            <select
                                value={compareToId}
                                onChange={(e) => setCompareToId(e.target.value)}
                                style={pgSel}
                            >
                                {photoCheckIns.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {format(new Date(c.created_at), 'd MMM yyyy')} ·{' '}
                                        {c.weight != null ? `${c.weight} kg` : '—'}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="flex" style={{ gap: 18, marginBottom: 10 }}>
                        <div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Δ Peso </span>
                            <span
                                className="font-bold"
                                style={{
                                    fontSize: 13,
                                    color:
                                        dW == null
                                            ? 'var(--text-muted)'
                                            : dW <= 0
                                              ? 'var(--success-600)'
                                              : 'var(--ember-700)',
                                }}
                            >
                                {dW == null ? '—' : `${dW >= 0 ? '+' : ''}${dW} kg`}
                            </span>
                        </div>
                        <div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Δ Energía </span>
                            <span
                                className="font-bold"
                                style={{
                                    fontSize: 13,
                                    color:
                                        dE == null
                                            ? 'var(--text-muted)'
                                            : dE >= 0
                                              ? 'var(--success-600)'
                                              : 'var(--ember-700)',
                                }}
                            >
                                {dE == null ? '—' : `${dE >= 0 ? '+' : ''}${dE}`}
                            </span>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="md"
                        className="w-full"
                        disabled={
                            !baseCi?.front_photo_url ||
                            !compareCi?.front_photo_url ||
                            baseCi.id === compareCi.id
                        }
                        onClick={() => setCompareOpen(true)}
                    >
                        <Images className="mr-2 h-4 w-4" />
                        Abrir comparativa
                    </Button>
                    <PhotoComparisonSlider
                        isOpen={compareOpen}
                        onClose={() => setCompareOpen(false)}
                        beforePhoto={baseCi?.front_photo_url || ''}
                        afterPhoto={compareCi?.front_photo_url || ''}
                        beforeDate={baseCi ? format(new Date(baseCi.created_at), 'd MMM yyyy') : ''}
                        afterDate={compareCi ? format(new Date(compareCi.created_at), 'd MMM yyyy') : ''}
                    />
                </Card>
            )}

            {/* ── Historial de check-ins (timeline en cards) ─────────────── */}
            <SectionTitle>Historial de check-ins</SectionTitle>
            <div className="space-y-2.5">
                {sortedDesc.map((ci) => (
                    <Card key={ci.id} padding="md">
                        <div
                            className="flex items-center justify-between"
                            style={{ marginBottom: 8 }}
                        >
                            <div
                                className="font-extrabold text-strong"
                                style={{ fontSize: 14 }}
                            >
                                {format(new Date(ci.created_at), 'd MMM yyyy · HH:mm')}
                            </div>
                        </div>
                        <div className="flex" style={{ gap: 12 }}>
                            {ci.front_photo_url ? (
                                <button
                                    type="button"
                                    onClick={() => setDotDetail(ci)}
                                    className="relative shrink-0 overflow-hidden"
                                    style={{
                                        width: 60,
                                        height: 60,
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border-default)',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    <Image
                                        src={ci.front_photo_url}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="60px"
                                        unoptimized
                                    />
                                </button>
                            ) : null}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="flex" style={{ gap: 18, marginBottom: 4 }}>
                                    <div>
                                        <span
                                            className="font-display font-black tracking-tight tabular-nums text-strong"
                                            style={{ fontSize: 17 }}
                                        >
                                            {ci.weight != null ? ci.weight : '—'}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            {' '}
                                            kg
                                        </span>
                                    </div>
                                    <div className="flex items-center" style={{ gap: 2 }}>
                                        <EnergyStars level={ci.energy_level} />
                                    </div>
                                </div>
                                {ci.notes ? (
                                    <div style={{ fontSize: 13, color: 'var(--text-body)' }}>
                                        {ci.notes}
                                    </div>
                                ) : (
                                    <div
                                        className="italic"
                                        style={{ fontSize: 12, color: 'var(--text-subtle)' }}
                                    >
                                        Sin notas
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* ── Modal de detalle de check-in ───────────────────────────── */}
            <Dialog open={!!dotDetail} onOpenChange={(o) => !o && setDotDetail(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle
                            className="font-extrabold text-strong"
                            style={{ fontSize: 18 }}
                        >
                            Check-in
                            {dotDetail
                                ? ` · ${format(new Date(dotDetail.created_at), 'd MMM yyyy')}`
                                : ''}
                        </DialogTitle>
                    </DialogHeader>
                    {dotDetail && (
                        <div className="space-y-3">
                            {dotDetail.front_photo_url ? (
                                <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-[var(--radius-md)] border border-default">
                                    <Image
                                        src={dotDetail.front_photo_url}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="320px"
                                        unoptimized
                                    />
                                </div>
                            ) : null}
                            <div className="flex items-center" style={{ gap: 20 }}>
                                <div>
                                    <span
                                        className="font-display font-black tracking-tight tabular-nums text-strong"
                                        style={{ fontSize: 20 }}
                                    >
                                        {dotDetail.weight != null ? dotDetail.weight : '—'}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> kg</span>
                                </div>
                                {dotDetail.energy_level != null && (
                                    <div className="flex items-center" style={{ gap: 2 }}>
                                        <EnergyStars level={dotDetail.energy_level} />
                                        <span
                                            style={{
                                                fontSize: 11.5,
                                                color: 'var(--text-muted)',
                                                marginLeft: 4,
                                            }}
                                        >
                                            {dotDetail.energy_level}/10
                                        </span>
                                    </div>
                                )}
                            </div>
                            {dotDetail.notes ? (
                                <div style={{ fontSize: 13.5, color: 'var(--text-body)' }}>
                                    {dotDetail.notes}
                                </div>
                            ) : null}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
