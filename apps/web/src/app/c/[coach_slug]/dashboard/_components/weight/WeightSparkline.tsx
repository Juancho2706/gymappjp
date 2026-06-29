'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Area, AreaChart } from 'recharts'

interface Point {
    iso: string
    weight: number
}

export function WeightSparkline({ data }: { data: Point[] }) {
    const reduce = useReducedMotion()
    const chartData = useMemo(() => data.map((d) => ({ ...d, w: d.weight })), [data])
    const chartRef = useRef<HTMLDivElement>(null)
    const [chartWidth, setChartWidth] = useState(0)

    useEffect(() => {
        if (!chartRef.current) return
        const updateWidth = () => setChartWidth(Math.max(0, Math.floor(chartRef.current?.clientWidth ?? 0)))
        updateWidth()
        const observer = new ResizeObserver(updateWidth)
        observer.observe(chartRef.current)
        return () => observer.disconnect()
    }, [])

    if (chartData.length === 0) return null

    return (
        <div ref={chartRef} className="mt-3 h-[72px] w-full min-w-px">
            {chartWidth > 0 && (
                <AreaChart width={chartWidth} height={72} data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="wGradDash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--sport-500)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--sport-500)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="w" stroke="var(--sport-500)" strokeWidth={2} fill="url(#wGradDash)" dot={false} isAnimationActive={!reduce} />
                </AreaChart>
            )}
        </div>
    )
}
