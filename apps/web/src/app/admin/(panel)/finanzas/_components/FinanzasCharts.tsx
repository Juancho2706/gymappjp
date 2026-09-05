'use client'

import {
    ComposedChart, BarChart, PieChart,
    Area, Bar, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// Reglas de color de los charts del panel (F2 08-05): NADA de hex ni neutral-*. Todo sale de
// tokens EVA DS via `var(--...)` — los atributos de presentacion SVG resuelven custom properties,
// asi que el chart sigue el tema sin duplicar paletas.
const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 10 }
const GRID_STROKE = 'var(--border-subtle)'

const TOOLTIP_STYLE = {
    contentStyle: {
        backgroundColor: 'var(--surface-card)',
        borderColor: 'var(--border-subtle)',
        borderRadius: 10,
        color: 'var(--text-strong)',
        fontSize: 12,
    },
    itemStyle: { color: 'var(--text-strong)' },
    labelStyle: { color: 'var(--text-muted)' },
}

const CYCLE_COLORS: Record<string, string> = {
    monthly: 'var(--viz-1)',
    quarterly: 'var(--viz-2)',
    // El RPC devuelve billing_cycle='annual' (no 'yearly') — clave alineada al CHECK de DB.
    annual: 'var(--viz-3)',
}

const TIER_COLORS: Record<string, string> = {
    free: 'var(--viz-6)',
    pro: 'var(--viz-1)',
    elite: 'var(--viz-2)',
    growth: 'var(--viz-5)', // LEGACY — visible en el desglose de grandfathered
    scale: 'var(--viz-3)', // LEGACY
}

const FALLBACK_COLOR = 'var(--viz-6)'

const CYCLE_LABELS: Record<string, string> = {
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    annual: 'Anual',
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'YYYY-MM' → 'ene 26' (mes localizado + año corto, legible en el eje sin rotar). */
function ymLabel(ym: string): string {
    const [year, month] = ym.split('-')
    const idx = Number(month) - 1
    if (!year || Number.isNaN(idx) || !MONTHS_ES[idx]) return ym
    return `${MONTHS_ES[idx]} ${year.slice(2)}`
}

function clpK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n}`
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-card border border-subtle bg-surface-card p-4 shadow-[var(--shadow-sm)]">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">{title}</h3>
            {children}
        </div>
    )
}

interface Props {
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    churnSeries: { ym: string; churned_count: number }[]
    revenueByCycle: { billing_cycle: string; mrr_clp: number; coach_count: number }[]
    revenueByTier: { tier: string; mrr_clp: number; coach_count: number }[]
}

export function FinanzasCharts({ mrrSeries, churnSeries, revenueByCycle, revenueByTier }: Props) {
    const mrrData = mrrSeries.map(d => ({ ...d, label: ymLabel(d.ym) }))
    const churnData = churnSeries.map(d => ({ ...d, label: ymLabel(d.ym) }))
    const cycleData = revenueByCycle.map(d => ({
        ...d,
        label: CYCLE_LABELS[d.billing_cycle] ?? d.billing_cycle,
    }))

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* MRR por mes — area (eje izq, CLP) + coaches (eje der, conteo) */}
            <ChartCard title="MRR por mes">
                {mrrData.length === 0 || mrrData.every(d => d.mrr_clp === 0) ? (
                    <p className="py-10 text-center text-xs text-muted">Sin datos aún</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={mrrData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                            <XAxis dataKey="label" interval="preserveStartEnd" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="mrr" tickFormatter={clpK} tick={AXIS_TICK} axisLine={false} tickLine={false} width={50} />
                            {/* Eje secundario: el conteo de coaches vive en otra escala que los CLP —
                                compartir eje aplastaba la barra contra el piso. */}
                            <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
                            <Tooltip
                                {...TOOLTIP_STYLE}
                                formatter={(value: unknown, name: unknown) => (
                                    name === 'MRR'
                                        ? [clpK(value as number), 'MRR']
                                        : [String(value), String(name)]
                                )}
                            />
                            <Bar yAxisId="count" dataKey="coach_count" name="Coaches" fill="var(--viz-4)" fillOpacity={0.35} radius={[2, 2, 0, 0]} />
                            <Area yAxisId="mrr" type="monotone" dataKey="mrr_clp" name="MRR" stroke="var(--sport-500)" fill="var(--sport-500)" fillOpacity={0.15} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* Churn mensual */}
            <ChartCard title="Churn mensual">
                {churnData.length === 0 || churnData.every(d => d.churned_count === 0) ? (
                    <p className="py-10 text-center text-xs text-muted">Sin churns registrados</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={churnData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                            <XAxis dataKey="label" interval="preserveStartEnd" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <Bar dataKey="churned_count" name="Bajas" fill="var(--danger-500)" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* Revenue por ciclo — donut (mezcla mensual/trimestral/anual, no redundante con tier) */}
            <ChartCard title="Revenue por ciclo de facturación">
                {cycleData.length === 0 ? (
                    <p className="py-10 text-center text-xs text-muted">Sin datos aún</p>
                ) : (
                    <div className="flex flex-wrap items-center gap-4">
                        <ResponsiveContainer width={160} height={160}>
                            <PieChart>
                                <Pie
                                    data={cycleData}
                                    dataKey="mrr_clp"
                                    nameKey="label"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={2}
                                >
                                    {cycleData.map((entry) => (
                                        <Cell key={entry.billing_cycle} fill={CYCLE_COLORS[entry.billing_cycle] ?? FALLBACK_COLOR} />
                                    ))}
                                </Pie>
                                <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => clpK(v as number)} />
                            </PieChart>
                        </ResponsiveContainer>
                        <ul className="flex min-w-0 flex-col gap-2">
                            {cycleData.map(d => (
                                <li key={d.billing_cycle} className="flex items-center gap-2">
                                    <span
                                        aria-hidden
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: CYCLE_COLORS[d.billing_cycle] ?? FALLBACK_COLOR }}
                                    />
                                    <span className="text-xs text-body">{d.label}</span>
                                    <span className="font-mono text-xs tabular-nums text-strong">{clpK(d.mrr_clp)}</span>
                                    <span className="text-[11px] text-muted">({d.coach_count})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </ChartCard>

            {/* Revenue por tier — barra horizontal */}
            <ChartCard title="Revenue por tier">
                {revenueByTier.length === 0 ? (
                    <p className="py-10 text-center text-xs text-muted">Sin datos aún</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={revenueByTier} layout="vertical" margin={{ top: 4, right: 4, left: 40, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                            <XAxis type="number" tickFormatter={clpK} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="tier" tick={{ fill: 'var(--text-body)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => clpK(v as number)} />
                            <Bar dataKey="mrr_clp" name="MRR" radius={[0, 2, 2, 0]}>
                                {revenueByTier.map((entry) => (
                                    <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? FALLBACK_COLOR} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>
        </div>
    )
}
