'use client'

import {
    ComposedChart, AreaChart, BarChart, PieChart,
    Area, Bar, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const TOOLTIP_STYLE = {
    contentStyle: { backgroundColor: '#0f1117', borderColor: '#1e2533', color: '#f1f5f9', fontSize: 12 },
    itemStyle: { color: '#f1f5f9' },
    labelStyle: { color: '#94a3b8' },
}

const TIER_COLORS: Record<string, string> = {
    starter: '#475569',
    pro:     '#60a5fa',
    elite:   '#a78bfa',
    scale:   '#22c55e',
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">{title}</p>
            {children}
        </div>
    )
}

interface Props {
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    tierSeries: { ym: string; tier: string; coach_count: number }[]
    sessions:   { day: string; sessions: number }[]
    coachesByTier: Record<string, number>
}

export function ChartSection({ mrrSeries, tierSeries, sessions, coachesByTier }: Props) {
    // Reshape tier series: [{ym, starter, pro, elite, scale}]
    const tierByMonth = Array.from(new Set(tierSeries.map(d => d.ym))).map(ym => {
        const row: Record<string, number | string> = { ym }
        for (const d of tierSeries.filter(x => x.ym === ym)) {
            row[d.tier] = d.coach_count
        }
        return row
    })

    // Pie data from coachesByTier
    const pieData = Object.entries(coachesByTier)
        .filter(([, v]) => v > 0)
        .map(([tier, count]) => ({ tier, count }))

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* MRR 12 meses (wide) */}
            <div className="lg:col-span-2">
                <ChartCard title="MRR 12 meses">
                    <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={mrrSeries}>
                                <defs>
                                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor="#2e7cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#2e7cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
                                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#475569' }} />
                                <YAxis yAxisId="mrr" tick={{ fontSize: 10, fill: '#475569' }}
                                    tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                                <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                                <Tooltip {...TOOLTIP_STYLE}
                                    formatter={(v: unknown, name: unknown) =>
                                        name === 'MRR' ? [`$${(v as number).toLocaleString('es-CL')}`, name as string] : [v as number, name as string]} />
                                <Area yAxisId="mrr" type="monotone" dataKey="mrr_clp" name="MRR"
                                    stroke="#2e7cf6" fill="url(#mrrGrad)" strokeWidth={2} />
                                <Bar yAxisId="count" dataKey="coach_count" name="Nuevos coaches"
                                    fill="#2e7cf6" opacity={0.3} radius={[2, 2, 0, 0]} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* Tier donut (narrow) */}
            <ChartCard title="Distribución tiers actual">
                <div className="h-52 flex items-center justify-center">
                    {pieData.length === 0 ? (
                        <p className="text-xs text-[--admin-text-3]">Sin datos</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="count" nameKey="tier"
                                    cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
                                    paddingAngle={3}>
                                    {pieData.map(d => (
                                        <Cell key={d.tier} fill={TIER_COLORS[d.tier] ?? '#475569'} />
                                    ))}
                                </Pie>
                                <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [v, name]} />
                                <Legend iconType="circle" iconSize={8}
                                    formatter={v => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </ChartCard>

            {/* Tier stacked bar (wide) */}
            <div className="lg:col-span-2">
                <ChartCard title="Coaches por tier (6 meses)">
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tierByMonth}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
                                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#475569' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                                <Tooltip {...TOOLTIP_STYLE} />
                                {['starter', 'pro', 'elite', 'scale'].map(tier => (
                                    <Bar key={tier} dataKey={tier} stackId="a"
                                        fill={TIER_COLORS[tier]} radius={tier === 'scale' ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* Sessions 30d (narrow) */}
            <ChartCard title="Actividad plataforma (30d)">
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sessions}>
                            <defs>
                                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#475569' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="sessions" name="Sesiones"
                                stroke="#22c55e" fill="url(#sessGrad)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>
        </div>
    )
}
