'use client'

import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface Point {
    iso: string
    weight: number
}

export function WeightSparkline({ data }: { data: Point[] }) {
    const chartData = useMemo(() => data.map((d) => ({ ...d, w: d.weight })), [data])
    if (chartData.length === 0) return null

    return (
        <div className="mt-3 h-[72px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="wGradDash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--theme-primary)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--theme-primary)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="w" stroke="var(--theme-primary)" strokeWidth={2} fill="url(#wGradDash)" dot={false} isAnimationActive />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
