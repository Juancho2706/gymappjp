'use client'

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

interface TrendPoint {
    date: string
    value: number | null
}

/**
 * Render recharts compartido de las tendencias de composicion corporal (BIA/ISAK). Se carga con
 * `next/dynamic({ ssr: false })` desde `StudentBiaTrend`/`StudentIsakTrend` para mantener recharts+d3
 * (~85 KB gz) fuera del First Load de `/c/bodycomp`. El AreaChart va dentro del `h-56 w-full` del
 * padre; el gradiente se identifica por `fillId` para no colisionar entre BIA e ISAK.
 */
export function BodyCompTrendChart({
    chartData,
    reduce,
    fmt,
    label,
    fillId,
}: {
    chartData: TrendPoint[]
    reduce: boolean | null
    fmt: (v: number) => string
    label: string
    fillId: string
}) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                    <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={42} />
                <Tooltip
                    contentStyle={{
                        borderRadius: 14,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--surface-card)',
                        color: 'var(--text-body)',
                        fontSize: 12,
                    }}
                    formatter={(value) => [fmt(Number(value)), label]}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--theme-primary)"
                    strokeWidth={2.5}
                    fill={`url(#${fillId})`}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={!reduce}
                />
            </AreaChart>
        </ResponsiveContainer>
    )
}
