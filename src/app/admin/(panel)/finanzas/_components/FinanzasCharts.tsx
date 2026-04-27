'use client'

import {
    ComposedChart, BarChart, PieChart,
    Area, Bar, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const TOOLTIP_STYLE = {
    contentStyle: { backgroundColor: '#0f1117', borderColor: '#1e2533', color: '#f1f5f9', fontSize: 12 },
    itemStyle: { color: '#f1f5f9' },
    labelStyle: { color: '#94a3b8' },
}

const CYCLE_COLORS: Record<string, string> = {
    monthly: '#2e7cf6',
    quarterly: '#a78bfa',
    yearly: '#22c55e',
}

const TIER_COLORS: Record<string, string> = {
    starter: '#475569',
    pro: '#60a5fa',
    elite: '#a78bfa',
    scale: '#22c55e',
}

function clpK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n}`
}

interface Props {
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    churnSeries: { ym: string; churned_count: number }[]
    revenueByCycle: { billing_cycle: string; mrr_clp: number; coach_count: number }[]
    revenueByTier: { tier: string; mrr_clp: number; coach_count: number }[]
}

export function FinanzasCharts({ mrrSeries, churnSeries, revenueByCycle, revenueByTier }: Props) {
    const mrrData = mrrSeries.map(d => ({ ...d, label: d.ym.slice(5) }))
    const churnData = churnSeries.map(d => ({ ...d, label: d.ym.slice(5) }))

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* MRR 12 months */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">MRR 12 meses</h3>
                {mrrData.length === 0 || mrrData.every(d => d.mrr_clp === 0) ? (
                    <p className="py-10 text-center text-xs text-[--admin-text-3]">Sin datos aún</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={mrrData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
                            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={clpK} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                            <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => clpK(v as number)} />
                            <Area type="monotone" dataKey="mrr_clp" stroke="#2e7cf6" fill="#2e7cf6" fillOpacity={0.15} strokeWidth={2} name="MRR" />
                            <Bar dataKey="coach_count" fill="#60a5fa" fillOpacity={0.4} name="Coaches" yAxisId={0} />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Churn mensual */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">Churn mensual</h3>
                {churnData.length === 0 || churnData.every(d => d.churned_count === 0) ? (
                    <p className="py-10 text-center text-xs text-[--admin-text-3]">Sin churns registrados</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={churnData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
                            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <Bar dataKey="churned_count" fill="#ef4444" fillOpacity={0.7} name="Churned" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Revenue por billing cycle — donut */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">Revenue por ciclo de facturación</h3>
                {revenueByCycle.length === 0 ? (
                    <p className="py-10 text-center text-xs text-[--admin-text-3]">Sin datos aún</p>
                ) : (
                    <div className="flex items-center gap-4">
                        <ResponsiveContainer width={160} height={160}>
                            <PieChart>
                                <Pie
                                    data={revenueByCycle}
                                    dataKey="mrr_clp"
                                    nameKey="billing_cycle"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={2}
                                >
                                    {revenueByCycle.map((entry) => (
                                        <Cell key={entry.billing_cycle} fill={CYCLE_COLORS[entry.billing_cycle] ?? '#475569'} />
                                    ))}
                                </Pie>
                                <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => clpK(v as number)} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-col gap-2">
                            {revenueByCycle.map(d => (
                                <div key={d.billing_cycle} className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CYCLE_COLORS[d.billing_cycle] ?? '#475569' }} />
                                    <span className="text-xs text-[--admin-text-2] capitalize">{d.billing_cycle}</span>
                                    <span className="font-mono text-xs tabular-nums text-[--admin-text-1]">{clpK(d.mrr_clp)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Revenue por tier — horizontal bar */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">Revenue por tier</h3>
                {revenueByTier.length === 0 ? (
                    <p className="py-10 text-center text-xs text-[--admin-text-3]">Sin datos aún</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={revenueByTier} layout="vertical" margin={{ top: 4, right: 4, left: 40, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" horizontal={false} />
                            <XAxis type="number" tickFormatter={clpK} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="tier" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => clpK(v as number)} />
                            <Bar dataKey="mrr_clp" name="MRR" radius={[0, 2, 2, 0]}>
                                {revenueByTier.map((entry) => (
                                    <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? '#475569'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    )
}
