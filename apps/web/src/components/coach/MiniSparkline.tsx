'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'

interface MiniSparklineProps {
    data: { value: number }[]
    color?: string
}

export function MiniSparkline({ data, color = '#007AFF' }: MiniSparklineProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted || !data || data.length === 0) return (
        <div className="w-full h-8 opacity-20 bg-primary/10 rounded-sm animate-pulse" />
    )

    return (
        <div className="w-full h-8 opacity-50 group-hover:opacity-100 transition-opacity duration-500">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
