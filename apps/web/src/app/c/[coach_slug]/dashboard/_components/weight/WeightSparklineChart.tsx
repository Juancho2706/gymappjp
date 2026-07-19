'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Area, AreaChart } from 'recharts'

interface Point {
    iso: string
    weight: number
}

/**
 * Render recharts del sparkline de peso. Se carga con `next/dynamic({ ssr: false })` desde
 * `WeightSparkline` para mantener recharts+d3 (~86 KB gz) fuera del First Load del dashboard.
 */
export function WeightSparklineChart({ data }: { data: Point[] }) {
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

    // Punto final marcado sobre la curva (kit alumno-dashboard.jsx:447).
    const lastIndex = chartData.length - 1
    const renderLastDot = (props: { cx?: number; cy?: number; index?: number; key?: React.Key | null }) => {
        const { cx, cy, index, key } = props
        if (index !== lastIndex || cx == null || cy == null) return <g key={key ?? `d${index}`} />
        return (
            <circle
                key={key ?? 'last'}
                cx={cx}
                cy={cy}
                r={4}
                fill="var(--sport-500)"
                stroke="var(--surface-card)"
                strokeWidth={2.5}
            />
        )
    }

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
                    <Area type="monotone" dataKey="w" stroke="var(--sport-500)" strokeWidth={2} fill="url(#wGradDash)" dot={renderLastDot} isAnimationActive={!reduce} />
                </AreaChart>
            )}
        </div>
    )
}
