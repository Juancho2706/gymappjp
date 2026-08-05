'use client'

import { Fragment, type ReactElement, type ReactNode } from 'react'
import {
    ComposedChart, AreaChart, BarChart,
    Area, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

/**
 * Charts del dashboard CEO sobre tokens EVA DS (F2 08-05).
 *
 * - CERO hex: todo color sale de CSS vars. Recharts las acepta tal cual en atributos
 *   SVG (stroke / fill / stopColor) y en los estilos inline del tooltip, así que el
 *   panel sigue el flip claro/oscuro sin duplicar paletas en JS (antes: 16 hex).
 * - Grid con escalón tablet (md:2 → xl:3). Antes saltaba de 1 a 3 columnas y en
 *   tablet quedaban cards de ~900x200.
 * - El donut "Distribución tiers actual" se retiró: repetía la última barra del
 *   apilado. La distribución de hoy vive ahora como chips-leyenda en el header de
 *   "Coaches por tier", que además hace de leyenda de las series.
 * - MRR: eje Y derecho propio para la barra de coaches (contra millones de CLP en
 *   el eje izquierdo la barra era invisible).
 */

/* ─────────────── Tokens (nada de hex acá) ─────────────── */

const TOOLTIP_STYLE = {
    contentStyle: {
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--text-strong)',
        fontSize: 12,
    },
    itemStyle: { color: 'var(--text-strong)' },
    labelStyle: { color: 'var(--text-muted)', fontSize: 11 },
}

/** Cursor del tooltip. Recharts dibuja un Rectangle en BarChart y una línea (Curve) en
 *  Composed/Area, así que van fill Y stroke tokenizados: si no, hereda su gris hardcodeado. */
const TOOLTIP_CURSOR = { fill: 'var(--surface-sunken)', stroke: 'var(--border-strong)', strokeWidth: 1 }

const AXIS_TICK = { fontSize: 10, fill: 'var(--text-muted)' }
const GRID_STROKE = 'var(--border-subtle)'

const MRR_COLOR = 'var(--sport-500)'
const COACHES_COLOR = 'var(--viz-4)'
const SESSIONS_COLOR = 'var(--success-500)'

/** Orden del apilado (de abajo hacia arriba). */
const TIER_ORDER = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']

/** Categóricos --viz-1..6. Alineados con los tonos de AdminStatusBadge donde existe
 *  equivalente (pro→sport, elite→aqua) para que el color del tier sea el mismo en
 *  todo el panel. */
const TIER_COLORS: Record<string, string> = {
    free:    'var(--viz-6)',
    starter: 'var(--viz-4)',
    pro:     'var(--viz-1)',
    elite:   'var(--viz-3)',
    growth:  'var(--viz-5)',
    scale:   'var(--viz-2)',
}

const TIER_LABELS: Record<string, string> = {
    free: 'Free', starter: 'Starter', pro: 'Pro',
    elite: 'Elite', growth: 'Growth', scale: 'Scale',
}

const tierColor = (tier: string) => TIER_COLORS[tier] ?? 'var(--viz-6)'
const tierLabel = (tier: string) => TIER_LABELS[tier] ?? tier

/* ─────────────── Formatters (parseo a mano: new Date('2026-08') es UTC
       y en Chile puede caer al mes anterior) ─────────────── */

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthParts(ym: string): { abbr: string; year: string } | null {
    const [year, month] = String(ym).split('-')
    const abbr = MONTH_ABBR[Number(month) - 1]
    if (!abbr || !year) return null
    return { abbr, year }
}

/** Tick del eje X: año corto en el primer tick y cada vez que la serie cruza enero. */
function monthTick(ym: string, index: number): string {
    const parts = monthParts(ym)
    if (!parts) return String(ym)
    const withYear = index === 0 || String(ym).endsWith('-01')
    return withYear ? `${parts.abbr} ${parts.year.slice(2)}` : parts.abbr
}

/** Label del tooltip: mes + año completo. */
function monthLong(ym: string): string {
    const parts = monthParts(ym)
    return parts ? `${parts.abbr} ${parts.year}` : String(ym)
}

/** 'YYYY-MM-DD' → '5 ago' */
function dayLabel(day: string): string {
    const [, month, date] = String(day).split('-')
    const abbr = MONTH_ABBR[Number(month) - 1]
    if (!abbr || !date) return String(day)
    return `${Number(date)} ${abbr}`
}

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`

function clpAxis(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `$${Math.round(v / 1000)}K`
    return `$${v}`
}

/* ─────────────── Piezas de UI ─────────────── */

function ChartCard({ title, legend, className, children }: {
    title: string
    legend?: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <div className={`flex flex-col rounded-card border border-subtle bg-surface-card p-4 shadow-[var(--shadow-sm)] ${className ?? ''}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{title}</p>
                {legend && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">{legend}</div>
                )}
            </div>
            {children}
        </div>
    )
}

/** Chip que hace de leyenda (y, en tiers, de distribución actual). */
function LegendChip({ color, label, value }: { color: string; label: string; value?: number }) {
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-body">
            <span aria-hidden className="size-2 shrink-0 rounded-pill" style={{ background: color }} />
            {label}
            {value !== undefined && (
                <span className="font-bold tabular-nums text-strong">{value}</span>
            )}
        </span>
    )
}

function LegendChips({ items }: { items: { key: string; color: string; label: string; value?: number }[] }) {
    return (
        <>
            {items.map((item, i) => (
                <Fragment key={item.key}>
                    {i > 0 && <span aria-hidden className="text-[11px] text-muted">·</span>}
                    <LegendChip color={item.color} label={item.label} value={item.value} />
                </Fragment>
            ))}
        </>
    )
}

/**
 * Caja del chart. Si la serie viene vacía muestra el placeholder (misma altura, para
 * que la fila del grid no colapse); si no, expone el chart como `role="img"` con
 * descripción, porque el SVG de Recharts no dice nada a un lector de pantalla.
 */
function ChartBox({ height, empty, label, children }: {
    height: string
    empty: boolean
    label: string
    children: ReactNode
}) {
    if (empty) {
        return (
            <div className={`${height} flex items-center justify-center rounded-control border border-dashed border-subtle`}>
                <p className="text-xs text-muted">Sin datos todavía</p>
            </div>
        )
    }
    return (
        <div className={height} role="img" aria-label={label}>
            <ResponsiveContainer width="100%" height="100%">
                {children as ReactElement}
            </ResponsiveContainer>
        </div>
    )
}

/* ─────────────── Sección ─────────────── */

interface Props {
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    tierSeries: { ym: string; tier: string; coach_count: number }[]
    sessions:   { day: string; sessions: number }[]
    coachesByTier: Record<string, number>
}

export function ChartSection({ mrrSeries, tierSeries, sessions, coachesByTier }: Props) {
    /* Reshape tier series → [{ ym, starter, pro, ... }]. Los tiers ausentes en un mes
       quedan undefined a propósito: así el tooltip no lista seis filas en cero. */
    const byMonth = new Map<string, Record<string, string | number>>()
    for (const row of tierSeries) {
        const entry = byMonth.get(row.ym) ?? { ym: row.ym }
        entry[row.tier] = Number(row.coach_count ?? 0)
        byMonth.set(row.ym, entry)
    }
    const tierByMonth = Array.from(byMonth.values())

    /* Solo se dibujan las series con datos reales (evita Bars fantasma y ruido en el
       tooltip). Los tiers desconocidos van al final, después del orden canónico. */
    const present = new Set(tierSeries.map(r => r.tier))
    const activeTiers = [
        ...TIER_ORDER.filter(t => present.has(t)),
        ...Array.from(present).filter(t => !TIER_ORDER.includes(t)).sort(),
    ]

    /* Distribución de hoy: reemplaza al donut. */
    const tierChips = Object.entries(coachesByTier)
        .map(([tier, count]) => ({ tier, count: Number(count ?? 0) }))
        .filter(({ count }) => count > 0)
        .sort((a, b) => b.count - a.count)

    const lastMrr = mrrSeries[mrrSeries.length - 1]
    const peakSessions = sessions.length > 0 ? Math.max(...sessions.map(s => Number(s.sessions ?? 0))) : 0

    const mrrLabel = lastMrr
        ? `Gráfico de MRR de los últimos ${mrrSeries.length} meses. Último mes ${monthLong(lastMrr.ym)}: ${clp(Number(lastMrr.mrr_clp))} con ${lastMrr.coach_count} coaches.`
        : 'Gráfico de MRR de los últimos 12 meses.'

    const tierLabelA11y = tierChips.length > 0
        ? `Gráfico de barras apiladas de coaches por tier en ${tierByMonth.length} meses. Distribución actual: ${tierChips.map(c => `${tierLabel(c.tier)} ${c.count}`).join(', ')}.`
        : `Gráfico de barras apiladas de coaches por tier en ${tierByMonth.length} meses.`

    const sessionsLabel = `Gráfico de actividad diaria de la plataforma en los últimos 30 días. Máximo ${peakSessions} sesiones en un día.`

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* ── MRR 12 meses (2 col) ── */}
            <ChartCard
                title="MRR 12 meses"
                className="md:col-span-2"
                legend={<LegendChips items={[
                    { key: 'mrr', color: MRR_COLOR, label: 'MRR (izq)' },
                    { key: 'coaches', color: COACHES_COLOR, label: 'Coaches (der)' },
                ]} />}
            >
                <ChartBox height="h-56" empty={mrrSeries.length === 0} label={mrrLabel}>
                    <ComposedChart data={mrrSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="adminMrrGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={MRR_COLOR} stopOpacity={0.32} />
                                <stop offset="95%" stopColor={MRR_COLOR} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis
                            dataKey="ym"
                            tick={AXIS_TICK}
                            tickFormatter={monthTick}
                            interval="preserveStartEnd"
                            minTickGap={24}
                            tickMargin={6}
                            tickLine={false}
                            axisLine={{ stroke: GRID_STROKE }}
                        />
                        {/* Eje izquierdo = pesos. */}
                        <YAxis
                            yAxisId="left"
                            tick={AXIS_TICK}
                            tickFormatter={clpAxis}
                            tickLine={false}
                            axisLine={false}
                            width={52}
                        />
                        {/* Eje derecho = conteo de coaches: contra millones de CLP la barra
                            no se veía. */}
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={AXIS_TICK}
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={30}
                        />
                        <Tooltip
                            {...TOOLTIP_STYLE}
                            cursor={TOOLTIP_CURSOR}
                            labelFormatter={(label: unknown) => monthLong(String(label))}
                            formatter={(value: unknown, name: unknown) =>
                                name === 'MRR'
                                    ? [clp(Number(value)), String(name)]
                                    : [String(value), String(name)]}
                        />
                        <Bar
                            yAxisId="right"
                            dataKey="coach_count"
                            name="Nuevos coaches"
                            fill={COACHES_COLOR}
                            fillOpacity={0.55}
                            maxBarSize={22}
                            radius={[3, 3, 0, 0]}
                        />
                        <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="mrr_clp"
                            name="MRR"
                            stroke={MRR_COLOR}
                            fill="url(#adminMrrGrad)"
                            strokeWidth={2}
                            dot={false}
                        />
                    </ComposedChart>
                </ChartBox>
            </ChartCard>

            {/* ── Coaches por tier (1 col) — chips = distribución actual + leyenda ── */}
            <ChartCard
                title="Coaches por tier (6 meses)"
                legend={tierChips.length > 0 ? (
                    <LegendChips items={tierChips.map(c => ({
                        key: c.tier,
                        color: tierColor(c.tier),
                        label: tierLabel(c.tier),
                        value: c.count,
                    }))} />
                ) : undefined}
            >
                <ChartBox height="h-56" empty={activeTiers.length === 0} label={tierLabelA11y}>
                    <BarChart data={tierByMonth} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis
                            dataKey="ym"
                            tick={AXIS_TICK}
                            tickFormatter={monthTick}
                            interval="preserveStartEnd"
                            minTickGap={24}
                            tickMargin={6}
                            tickLine={false}
                            axisLine={{ stroke: GRID_STROKE }}
                        />
                        <YAxis
                            tick={AXIS_TICK}
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={28}
                        />
                        <Tooltip
                            {...TOOLTIP_STYLE}
                            cursor={TOOLTIP_CURSOR}
                            labelFormatter={(label: unknown) => monthLong(String(label))}
                        />
                        {activeTiers.map((tier, i) => (
                            <Bar
                                key={tier}
                                dataKey={tier}
                                name={tierLabel(tier)}
                                stackId="a"
                                fill={tierColor(tier)}
                                maxBarSize={28}
                                radius={i === activeTiers.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                            />
                        ))}
                    </BarChart>
                </ChartBox>
            </ChartCard>

            {/* ── Actividad 30d (fila completa en xl: 30 puntos diarios piden ancho) ── */}
            <ChartCard
                title="Actividad plataforma (30d)"
                className="xl:col-span-3"
                legend={<LegendChips items={[
                    { key: 'sessions', color: SESSIONS_COLOR, label: 'Sesiones / día' },
                ]} />}
            >
                <ChartBox height="h-48" empty={sessions.length === 0} label={sessionsLabel}>
                    <AreaChart data={sessions} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="adminSessGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={SESSIONS_COLOR} stopOpacity={0.32} />
                                <stop offset="95%" stopColor={SESSIONS_COLOR} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis
                            dataKey="day"
                            tick={AXIS_TICK}
                            tickFormatter={dayLabel}
                            interval="preserveStartEnd"
                            minTickGap={24}
                            tickMargin={6}
                            tickLine={false}
                            axisLine={{ stroke: GRID_STROKE }}
                        />
                        <YAxis
                            tick={AXIS_TICK}
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={28}
                        />
                        <Tooltip
                            {...TOOLTIP_STYLE}
                            cursor={TOOLTIP_CURSOR}
                            labelFormatter={(label: unknown) => dayLabel(String(label))}
                        />
                        <Area
                            type="monotone"
                            dataKey="sessions"
                            name="Sesiones"
                            stroke={SESSIONS_COLOR}
                            fill="url(#adminSessGrad)"
                            strokeWidth={2}
                            dot={false}
                        />
                    </AreaChart>
                </ChartBox>
            </ChartCard>
        </div>
    )
}
